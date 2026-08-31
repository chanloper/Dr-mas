/**
 * =================================================================================
 * [MAS: Medical Assistant System] 백엔드 오케스트레이션 서버 (server.js)
 * * [시스템 아키텍처 및 핵심 구현 기술]
 * 1. 보안 인프라: Bcrypt를 활용한 단방향 해시 암호화 및 express-session 기반 상태 유지 인증
 * 2. 비동기 최적화: Promise.all()을 활용한 다중 외부 API(카카오 로컬) 병렬 처리로 응답 레이턴시 단축
 * 3. 데이터 스트리밍: Transfer-Encoding: chunked 방식을 적용한 생성형 AI 텍스트 실시간 스트리밍
 * 4. Vision AI: Multer 미들웨어와 MemoryStorage를 활용한 멀티파트 바이너리 이미지 처리 파이프라인
 * 5. DB 마이그레이션: 서버 런타임 시작 시 MariaDB DDL 자동 수행 및 무결성 보장
 * * 학과 및 학년: 컴퓨터공학 / 소프트웨어 전공 3~4학년 종합설계(캡스톤 디자인) 기말 제출용
 * =================================================================================
 */

require('dotenv').config(); // 환경변수(.env) 보안 격리 및 메모리 적재
const express = require('express');
const session = require('express-session'); // 세션 기반 인메모리 인증 미들웨어
const mariadb = require('mariadb'); // 비동기 기반 MariaDB 클라이언트
const cors = require('cors'); // 교차 출처 리소스 공유(CORS) 정책 허용 미들웨어
const multer = require('multer'); // 멀티파트(multipart/form-data) 파일 업로드 처리기
const bcrypt = require('bcrypt'); // 레인보우 테이블 공격 방어를 위한 Salt 기반 패스워드 해싱
const axios = require('axios'); // RESTful HTTP 비동기 통신 클라이언트
const path = require('path'); // 파일 시스템 경로 정규화 모듈
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Google Gemini LLM 연동 SDK

const app = express();

// 디스크 I/O 병목을 막고 비전 AI에 즉각 전달하기 위한 RAM 기반 임시 스토리지 할당
const upload = multer({ storage: multer.memoryStorage() }); 

// =================================================================================
// ⚙️ [1] 글로벌 미들웨어 및 세션 설정
// =================================================================================
app.use(cors());
app.use(express.json()); // JSON 페이로드 자동 역직렬화(Deserialization) 미들웨어
app.use(express.urlencoded({ extended: true })); // URL 인코딩된 폼 데이터 파싱

// [보안] 클라이언트 인증 유지를 위한 세션 미들웨어 환경 세팅
app.use(session({
    secret: 'dr-mas-secret-key', // 세션 ID 암호화 서명 키
    resave: false, // 변경사항이 없을 시 세션 재저장 방지 (서버 리소스 최적화)
    saveUninitialized: true, // 초기화되지 않은 빈 세션 저장 허용
    cookie: { maxAge: 3600000 } // 세션 쿠키 만료 시간 설정 (1시간)
}));

// =================================================================================
// 🎨 [2] MVC 아키텍처 View 엔진 및 정적 리소스 경로 설정
// =================================================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// CSS 파일 등이 위치한 public 폴더를 정적 파일 제공 경로로 마운트 (스타일 누락 방지)
app.use(express.static(path.join(__dirname, 'public')));

// =================================================================================
// 🗄️ [3] 데이터베이스 인프라: MariaDB 커넥션 풀 초기화
// =================================================================================
// 자원 누수를 막고 동시성(Concurrency)을 확보하기 위해 Pool 인스턴스 패턴 적용
const pool = mariadb.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS,
    database: 'dr_mas_db',
    port: 3306,
    connectionLimit: 5, // 최대 동시 연결 수 제한을 통한 서버 부하 방지
    allowPublicKeyRetrieval: true
});

// Gemini AI 인스턴스 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// =================================================================================
// 🌐 [4] 프론트엔드 라우팅 (GET) - 뷰(View) 렌더링 구역
// =================================================================================
app.get('/', (req, res) => res.render('main'));
app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

// [라우트 가드] 세션(Session) 스크리닝을 통한 비인가 사용자 접근 제어
app.get('/chat', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.render('chat', { title: 'MAS AI Assistant', user: req.session.user });
});

// 로그아웃: 인메모리 세션 명시적 파기 및 리소스 회수
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).send('로그아웃 중 문제가 발생했습니다.');
        res.redirect('/login');
    });
});

app.get('/manage-places', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    let conn;
    try {
        conn = await pool.getConnection();
        const places = await conn.query('SELECT * FROM favorite_places WHERE user_id = ?', [req.session.user.userId]);
        res.render('manage-places', { user: req.session.user, places, kakaoKey: process.env.KAKAO_JS_KEY });
    } catch (err) {
        console.error(err); res.status(500).send('DB 조회 오류 발생');
    } finally { if (conn) conn.release(); }
});

app.get('/emergency-contact', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    let conn;
    try {
        conn = await pool.getConnection();
        const contacts = await conn.query('SELECT * FROM emergency_contacts WHERE user_id = ?', [req.session.user.userId]);
        res.render('emergency-contact', { user: req.session.user, contacts });
    } catch (err) {
        console.error(err); res.status(500).send('DB 조회 오류 발생');
    } finally { if (conn) conn.release(); }
});

app.get('/health-alerts', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    let conn;
    try {
        conn = await pool.getConnection();
        const alerts = await conn.query('SELECT * FROM health_alerts WHERE user_id = ?', [req.session.user.userId]);
        res.render('health-alerts', { user: req.session.user, alerts });
    } catch (err) {
        res.status(500).send('DB 조회 오류 발생');
    } finally { if (conn) conn.release(); }
});

// =================================================================================
// 🚀 [5] 백엔드 RESTful API 비즈니스 로직 (POST, DELETE)
// =================================================================================

// [API] 보안 처리된 회원가입 트랜잭션 (Bcrypt 단방향 암호화 적용)
app.post('/api/register', async (req, res) => {
    const { username, loginId, password, age, gender } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        // 고유 식별 키(ID) 중복 스크리닝
        const rows = await conn.query('SELECT user_id FROM Users WHERE login_id = ?', [loginId]);
        if (rows.length > 0) return res.status(400).send('<script>alert("이미 존재하는 아이디입니다."); history.back();</script>');

        // [보안] 10회의 Cost Factor를 가진 Bcrypt 해싱으로 평문 패스워드 완벽 치환
        const hashedPassword = await bcrypt.hash(password, 10);
        await conn.query(
            'INSERT INTO Users (login_id, password, username, age, gender) VALUES (?, ?, ?, ?, ?)',
            [loginId, hashedPassword, username, age ? parseInt(age, 10) : null, gender || null]
        );
        res.status(200).json({ success: true, message: '회원가입이 완료되었습니다.' });
    } catch (err) {
        console.error('회원가입 에러:', err);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    } finally {
        if (conn) conn.release();
    }
});

// [API] 로그인 인증 및 세션 발급 인터페이스
app.post('/api/login', async (req, res) => {
    const { loginId, password } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query('SELECT * FROM Users WHERE login_id = ?', [loginId]);
        if (rows.length === 0) return res.status(400).send('<script>alert("아이디 또는 비밀번호가 일치하지 않습니다."); history.back();</script>');

        const user = rows[0];
        // [보안] Bcrypt를 활용한 해시 페이로드 비교 연산 수행 (레인보우 테이블 공격 방어)
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).send('<script>alert("아이디 또는 비밀번호가 일치하지 않습니다."); history.back();</script>');

        // 인증 통과 시 서버 인메모리에 유저 식별 객체(Session) 발급
        req.session.user = { userId: user.user_id, username: user.username };
        res.send(`<script>alert("${user.username}님 환영합니다!"); location.href="/chat";</script>`);
    } catch (err) {
        console.error('로그인 에러:', err);
        res.status(500).send('<script>alert("서버 오류가 발생했습니다."); history.back();</script>');
    } finally {
        if (conn) conn.release();
    }
});

// [API] 지능형 의료 상담 채팅 (Streaming & 병렬 데이터 매싱 아키텍처)
app.post('/api/chat', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const { symptomText, userLat, userLng } = req.body;
    const currentUserId = req.session.user.userId;

    // [스트리밍 아키텍처] 청크(Chunk) 단위 전송을 위한 HTTP 응답 헤더 스펙 명시
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
        let localMedicalData = { hospitals: [], pharmacies: [] };

        // [네트워크 성능 최적화] Promise.all() 기반 카카오 로컬 API 비동기 병렬 호출
        if (userLat && userLng) {
            try {
                const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
                const [hospRes, pharmRes] = await Promise.all([
                    axios.get(`https://dapi.kakao.com/v2/local/search/category.json?category_group_code=HP8&y=${userLat}&x=${userLng}&radius=2000&sort=distance`, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } }),
                    axios.get(`https://dapi.kakao.com/v2/local/search/category.json?category_group_code=PM9&y=${userLat}&x=${userLng}&radius=2000&sort=distance`, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } })
                ]);
                localMedicalData.hospitals = hospRes.data.documents.slice(0, 3).map(d => `${d.place_name}(${d.distance}m 거리)`);
                localMedicalData.pharmacies = pharmRes.data.documents.slice(0, 3).map(d => `${d.place_name}(${d.distance}m 거리)`);
            } catch (err) {
                console.error('카카오 API 호출 에러:', err.message);
            }
        }

        const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: "너는 지능형 의료 비서 'MAS'야. 반드시 [질환]과 [가이드]라는 두 가지 섹션으로 나누어 대답해. [질환]에는 질환명만 짧게 적고, [가이드]에는 완화 팁과 함께 프롬프트로 전달된 [추천 병원]과 [추천 약국] 목록을 반드시 포함해서 안내해라."
});
        const prompt = `
        [사용자 증상]: "${symptomText}"
        [추천 병원]: ${localMedicalData.hospitals.join(', ') || '없음'}
        [추천 약국]: ${localMedicalData.pharmacies.join(', ') || '없음'}
        `;

        // LLM 스트림 인터페이스 호출 및 즉각적인 바이트 스트림 송신
        const resultStream = await model.generateContentStream(prompt);
        let aiFullText = '';

        // 비동기 이터레이터(Async Iterator)를 통한 청크 실시간 파이프라이닝
        for await (const chunk of resultStream.stream) {
            const chunkText = chunk.text();
            aiFullText += chunkText;
            res.write(chunkText); // 클라이언트 소켓으로 즉각 렌더링을 위해 전송
        }
        res.end(); // HTTP 스트림 전송 종료 선언

        // [비동기 백그라운드 워커] 스트림 종료 후 사용자 지연 없이 백그라운드에서 DB 적재 수행
        (async () => {
            let conn;
            try {
                const diseaseMatch = aiFullText.match(/\[질환\](.*?)(?=\[가이드\]|$)/s);
                const guideMatch = aiFullText.match(/\[가이드\](.*)/s);
                let dbDisease = diseaseMatch ? diseaseMatch[1].trim() : '분석 불가';
                const dbGuide = guideMatch ? guideMatch[1].trim() : aiFullText;
                if (dbDisease.length > 50) dbDisease = dbDisease.substring(0, 47) + '...';

                conn = await pool.getConnection();
                await conn.query(
                    'INSERT INTO symptom_logs (user_id, symptom_text, ai_predicted_disease, ai_guide) VALUES (?, ?, ?, ?)',
                    [currentUserId, symptomText, dbDisease, dbGuide]
                );
            } catch (err) { console.error('DB 저장 에러:', err); } 
            finally { if (conn) conn.release(); }
        })();

    } catch (err) {
        if (err.status === 429) {
            res.send('봇: 현재 사용자가 많아 AI가 숨을 고르고 있습니다. 1분 뒤에 다시 질문해 주세요!');
        } else {
            res.send('봇: 내부 서버 에러가 발생했습니다.');
        }
    }
});

// [CRUD API] 의료 기록 비동기 조회
app.post('/api/records', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: '로그인이 필요합니다.' });
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            "SELECT id, symptom_text, ai_predicted_disease, ai_guide, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as date FROM symptom_logs WHERE user_id = ? ORDER BY created_at DESC",
            [req.session.user.userId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: '데이터베이스 조회 중 오류가 발생했습니다.' });
    } finally { if (conn) conn.release(); }
});

// [CRUD API] 의료 기록 삭제
app.delete('/api/records/:id', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: '로그인이 필요합니다.' });
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query('DELETE FROM symptom_logs WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.userId]);
        if (result.affectedRows > 0) res.json({ success: true });
        else res.status(404).json({ success: false, message: '기록을 찾을 수 없습니다.' });
    } catch (err) {
        res.status(500).json({ error: '삭제 중 서버 오류가 발생했습니다.' });
    } finally { if (conn) conn.release(); }
});

// [CRUD API] 자주 가는 병원/약국 등록 및 삭제
app.post('/api/places', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { type, name, address, phone, memo } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            'INSERT INTO favorite_places (user_id, type, name, address, phone, memo) VALUES (?, ?, ?, ?, ?, ?)',
            [req.session.user.userId, type, name, address, phone, memo]
        );
        res.json({ success: true, insertId: Number(result.insertId) });
    } catch (err) { res.status(500).json({ error: 'DB 저장 실패' }); } finally { if (conn) conn.release(); }
});
app.delete('/api/places/:id', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: '로그인이 필요합니다.' });
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query("USE dr_mas_db");
        const places = await conn.query("SELECT * FROM favorite_places WHERE user_id = ?", [currentUserId]);
        
        res.render('manage-places', { 
            user: req.session.user, 
            places: places,
            kakaoKey: process.env.KAKAO_JS_KEY 
        }); 

    } catch (err) {
        console.error("병원/약국 조회 에러:", err);
        res.status(500).send("DB 조회 오류 발생");
    } finally {
        if (conn) conn.release();
    }
});

// [CRUD API] 긴급 연락처 등록 및 삭제
app.post('/api/emergency-contact', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { name, phone } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query('INSERT INTO emergency_contacts (user_id, name, phone) VALUES (?, ?, ?)', [req.session.user.userId, name, phone]);
        res.json({ success: true, insertId: Number(result.insertId) });
    } catch (err) { res.status(500).json({ error: 'DB 저장 실패' }); } finally { if (conn) conn.release(); }
});
app.delete('/api/emergency-contact/:id', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: '로그인이 필요합니다.' });
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query('DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.userId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'DB 삭제 실패' }); } finally { if (conn) conn.release(); }
});

// [API] 긴급 SOS 호출 파이프라인
app.post('/api/sos', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    let conn;
    try {
        conn = await pool.getConnection();
        const contacts = await conn.query('SELECT name, phone FROM emergency_contacts WHERE user_id = ?', [req.session.user.userId]);
        
        if (contacts.length === 0) return res.status(400).json({ success: false, message: '등록된 보호자 연락처가 없습니다.' });
        
        const phoneNumbers = contacts.map(c => c.phone);
        const sosMessage = `[MAS 긴급 알림] ${req.session.user.username}님에게 위급 상황이 발생했습니다. 즉시 연락을 취해주세요!`;
        
        console.log(`SOS 발송 대상: ${phoneNumbers.join(', ')} / 메시지: ${sosMessage}`);
        res.json({ success: true, message: 'SOS 전송 성공' });
    } catch (err) {
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    } finally { if (conn) conn.release(); }
});

// [CRUD API] 건강 알림 등록 및 삭제
app.post('/api/health-alerts', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { name, time } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query('INSERT INTO health_alerts (user_id, name, time, is_active) VALUES (?, ?, ?, 0)', [req.session.user.userId, name, time]);
        res.json({ success: true, insertId: Number(result.insertId) });
    } catch (err) { res.status(500).json({ error: 'DB 저장 실패' }); } finally { if (conn) conn.release(); }
});
app.delete('/api/health-alerts/:id', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: '로그인이 필요합니다.' });
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query('DELETE FROM health_alerts WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.userId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'DB 삭제 실패' }); } finally { if (conn) conn.release(); }
});

// [Vision AI API] 멀티모달 처방전/약 봉지 이미지 분석 (Multer Multipart/form-data 연동)
app.post('/api/analyze-prescription', upload.single('prescriptionImage'), async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: '로그인이 필요합니다.' });
    if (!req.file) return res.status(400).json({ error: '사진 파일이 전송되지 않았습니다.' });

    try {
        // 클라이언트로부터 버퍼 형태로 수신된 이진(Binary) 이미지 파일을 Base64 포맷으로 인코딩
        const imagePart = {
            inlineData: {
                data: req.file.buffer.toString('base64'),
                mimeType: req.file.mimetype
            }
        };

        const aiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const prompt = `
        너는 지능형 의료 비서 MAS다. 제공된 처방전 또는 약 봉지 사진을 OCR 인식하여 다음 항목들을 분석해라.
        환자가 노약자라고 가정하고, 전문 용어는 빼고 아주 쉽고 친절한 한국어로 작성해줘.
        [출력 양식]
        📋 1. 인식된 약 이름 및 성분:
        🎯 2. 주요 효능 및 효과:
        ⏰ 3. 올바른 복용 방법 (언제 먹나요?):
        ⚠️ 4. 절대 주의사항 및 부작용:
        `;

        const result = await aiModel.generateContent([prompt, imagePart]);
        res.json({ success: true, analysis: result.response.text() });
    } catch (err) {
        console.error('이미지 분석 에러:', err);
        res.status(500).json({ error: 'AI 분석 중 오류가 발생했습니다.' });
    }
});

// =================================================================================
// 🛠️ [6] 클라우드 데이터베이스 초기화 및 자동 마이그레이션 모듈
// =================================================================================
async function initDatabase() {
    let conn;
    try {
        conn = await pool.getConnection();
        // 1. 시스템 데이터베이스 생성 및 선택
        await conn.query('CREATE DATABASE IF NOT EXISTS dr_mas_db');
        await conn.query('USE dr_mas_db');

        // 2. 핵심 엔티티 릴레이션(Table) 자동 DDL 스키마 빌드 (IF NOT EXISTS로 데이터 보존)
        await conn.query(`CREATE TABLE IF NOT EXISTS Users (user_id INT AUTO_INCREMENT PRIMARY KEY, login_id VARCHAR(50) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, username VARCHAR(100) NOT NULL, age INT, gender VARCHAR(10), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        await conn.query(`CREATE TABLE IF NOT EXISTS symptom_logs (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, symptom_text TEXT NOT NULL, ai_predicted_disease VARCHAR(255), ai_guide TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        await conn.query(`CREATE TABLE IF NOT EXISTS emergency_contacts (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, name VARCHAR(100) NOT NULL, phone VARCHAR(50) NOT NULL)`);
        await conn.query(`CREATE TABLE IF NOT EXISTS health_alerts (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, name VARCHAR(255) NOT NULL, time VARCHAR(50) NOT NULL, is_active TINYINT(1) DEFAULT 0)`);
        await conn.query(`CREATE TABLE IF NOT EXISTS favorite_places (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, type VARCHAR(50) NOT NULL, name VARCHAR(100) NOT NULL, address VARCHAR(255), phone VARCHAR(50), memo TEXT)`);

        // 컬럼 추가 마이그레이션 예외 래핑 (이미 존재할 시 무시)
        try { await conn.query('ALTER TABLE favorite_places ADD COLUMN memo TEXT'); } catch (e) {}

        await conn.query(`CREATE TABLE IF NOT EXISTS user_settings (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL UNIQUE, voice_enabled TINYINT(1) DEFAULT 1)`);

        console.log('✅ [DB 마이그레이션] MariaDB DDL 스키마 런타임 동기화 완료!');
    } catch (err) {
        console.error('❌ DB 초기화 에러:', err);
    } finally {
        if (conn) conn.release();
    }
}

// =================================================================================
// 🚀 [7] 서버 엔트리 포인트 (Listen)
// =================================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 MAS 통합 백엔드 오케스트레이션 서버가 ${PORT}번 포트에서 가동 중입니다.`);
    // 런타임 진입 직후 무결성을 보장하기 위한 데이터베이스 마이그레이션 호출
    await initDatabase(); 
});


