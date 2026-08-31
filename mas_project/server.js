require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mariadb = require('mariadb');
const cors = require('cors');
const multer = require('multer'); // 💡 파일 업로드 부품 추가
const upload = multer({ storage: multer.memoryStorage() }); // 메모리에 임시 저장
const bcrypt = require('bcrypt'); // 암호 해싱
const axios = require('axios');

const path = require('path'); // EJS 경로 설정 모듈
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express(); 

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 💡 세션 미들웨어 설정
app.use(session({
    secret: 'dr-mas-secret-key', 
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 } 
}));

// --- EJS 설정 ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'backend', 'public')));

// --- 라우터 설정 ---
app.get('/', (req, res) => res.render('main'));

app.get('/chat', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.render('chat', { title: "MAS AI Assistant", user: req.session.user });
});

app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

// --- DB 커넥션 풀 설정 ---
const pool = mariadb.createPool({
    host: process.env.DB_HOST || 'dr-mas-db',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS,
    database: 'dr_mas_db', // 💡 이제 방이 무조건 존재하므로, 고정값으로 확실하게 주소를 지정해 줍니다!
    port: 3306,
    connectionLimit: 5,
    allowPublicKeyRetrieval: true
});

// Gemini AI 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==========================================
// [API] 1. 초고속 AI 채팅 (Streaming & 시스템 지침 적용)
// ==========================================
app.post('/api/chat', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "로그인이 필요합니다." });

    const { symptomText, userLat, userLng } = req.body;
    const currentUserId = req.session.user.userId;

    // 스트리밍을 위한 헤더 설정
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
        let localMedicalData = { hospitals: [], pharmacies: [] };

        // 카카오 API 동시 호출 (속도 2배 향상)
        if (userLat && userLng) {
            try {
                const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
                const [hospRes, pharmRes] = await Promise.all([
                    axios.get(`https://dapi.kakao.com/v2/local/search/category.json?category_group_code=HP8&y=${userLat}&x=${userLng}&radius=2000&sort=distance`, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } }),
                    axios.get(`https://dapi.kakao.com/v2/local/search/category.json?category_group_code=PM9&y=${userLat}&x=${userLng}&radius=2000&sort=distance`, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } })
                ]);
                localMedicalData.hospitals = hospRes.data.documents.slice(0, 3).map(d => `${d.place_name}(${d.distance}m 거리)`);
                localMedicalData.pharmacies = pharmRes.data.documents.slice(0, 3).map(d => `${d.place_name}(${d.distance}m 거리)`);
            } catch (error) { console.error("카카오 API 호출 에러"); }
        }

        // AI 모델 설정 (프롬프트 다이어트: 시스템 지침으로 기본 역할 부여)
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: "너는 지능형 의료 비서 'MAS'야. 반드시 [질환]과 [가이드]라는 두 가지 섹션으로 나누어 대답해. 단, [질환] 섹션에는 절대 길게 설명하지 말고 예상되는 질환명 단어만 1~3개 쉼표로 적어라."
        });

        // 얇아진 프롬프트 전송
        const prompt = `
        [사용자 증상]: "${symptomText}"
        [추천 병원]: ${localMedicalData.hospitals.join(', ') || '없음'}
        [추천 약국]: ${localMedicalData.pharmacies.join(', ') || '없음'}
        `;

        // 스트리밍 답변 생성
        const resultStream = await model.generateContentStream(prompt);
        let aiFullText = "";

        // 한 글자씩 프론트로 전송
        for await (const chunk of resultStream.stream) {
            const chunkText = chunk.text();
            aiFullText += chunkText;
            res.write(chunkText);
        }
        res.end();

        // 답변 전송 후 백그라운드 DB 저장
        (async () => {
            let conn;
            try {
                const diseaseMatch = aiFullText.match(/\[질환\](.*?)(?=\[가이드\]|$)/s);
                const guideMatch = aiFullText.match(/\[가이드\](.*)/s);
                
                // 💡 const를 let으로 바꾸고, 50자가 넘으면 자르는 방어 코드를 추가했습니다!
                let dbDisease = diseaseMatch ? diseaseMatch[1].trim() : "분석 불가";
                const dbGuide = guideMatch ? guideMatch[1].trim() : aiFullText;

                if (dbDisease.length > 50) {
                    dbDisease = dbDisease.substring(0, 47) + "...";
                }

                conn = await pool.getConnection();
                await conn.query(
                    "INSERT INTO symptom_logs (user_id, symptom_text, ai_predicted_disease, ai_guide) VALUES (?, ?, ?, ?)",
                    [currentUserId, symptomText, dbDisease, dbGuide]
                );
            } catch (dbErr) {
                console.error("DB 백그라운드 저장 에러:", dbErr);
            } finally {
                if (conn) conn.release();
            }
        })();

    } catch (error) {
        if (error.status === 429) {
            res.send("봇: 현재 사용자가 많아 AI가 숨을 고르고 있습니다. 1분 뒤에 다시 질문해 주세요! 😅");
        } else {
            res.send("봇: 에러가 발생했습니다.");
        }
    }
});

// ==========================================
// [API] 2. 회원가입 처리 (POST /api/register)
// ==========================================
app.post('/api/register', async (req, res) => {
    const { username, loginId, password, age, gender } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("SELECT user_id FROM Users WHERE login_id = ?", [loginId]);
        if (rows.length > 0) return res.status(400).send('<script>alert("이미 존재하는 아이디입니다."); history.back();</script>');

        const hashedPassword = await bcrypt.hash(password, 10);
        const parsedAge = age ? parseInt(age, 10) : null;
        const selectedGender = gender === "" ? null : gender;

        await conn.query(
            "INSERT INTO Users (login_id, password, username, age, gender) VALUES (?, ?, ?, ?, ?)",
            [loginId, hashedPassword, username, parsedAge, selectedGender]
        );
       res.status(200).json({ success: true, message: "회원가입이 완료되었습니다." });
    } catch (err) {
        console.error("회원가입 에러:", err);
        res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    } finally {
        if (conn) conn.release();
    }
});

// ==========================================
// [API] 3. 로그인 처리 (POST /api/login)
// ==========================================
app.post('/api/login', async (req, res) => {
    const { loginId, password } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("SELECT * FROM Users WHERE login_id = ?", [loginId]);
        if (rows.length === 0) return res.status(400).send('<script>alert("아이디 또는 비밀번호가 일치하지 않습니다."); history.back();</script>');

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).send('<script>alert("아이디 또는 비밀번호가 일치하지 않습니다."); history.back();</script>');

        req.session.user = { userId: user.user_id, username: user.username };
        res.send(`<script>alert("${user.username}님 환영합니다!"); location.href="/chat";</script>`);
    } catch (err) {
        console.error("로그인 에러:", err);
        res.status(500).send('<script>alert("서버 오류가 발생했습니다."); history.back();</script>');
    } finally {
        if (conn) conn.release();
    }
});
// =================================================================
// 🚪 로그아웃 기능 (세션 파기)
// =================================================================
app.get('/logout', (req, res) => {
    // 1. 유저의 로그인 세션(기억)을 삭제합니다.
    req.session.destroy((err) => {
        if (err) {
            console.error("로그아웃 에러:", err);
            return res.status(500).send("로그아웃 중 문제가 발생했습니다.");
        }
        // 2. 삭제가 완료되면 로그인 화면으로 돌려보냅니다.
        res.redirect('/login'); 
    });
});

// ==========================================
// [API] 4. 나의 의료 기록 조회 (POST /api/records)
// ==========================================
app.post('/api/records', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "로그인이 필요합니다." });
    const currentUserId = req.session.user.userId;
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            "SELECT id, symptom_text, ai_predicted_disease, ai_guide, DATE_FORMAT(created_at, '%Y-%m-%d %H:%M') as date FROM symptom_logs WHERE user_id = ? ORDER BY created_at DESC",
            [currentUserId]
        );
        res.json(rows);
    } catch (err) {
        console.error("의료 기록 조회 에러:", err);
        res.status(500).json({ error: "데이터베이스 조회 중 오류가 발생했습니다." });
    } finally {
        if (conn) conn.release();
    }
});
// ==========================================
// [API] 5. 나의 의료 기록 삭제 (DELETE /api/records/:id)
// ==========================================
app.delete('/api/records/:id', async (req, res) => {
    // 1. 로그인 확인
    if (!req.session.user) return res.status(401).json({ error: "로그인이 필요합니다." });

    const recordId = req.params.id;
    const currentUserId = req.session.user.userId;
    let conn;

    try {
        conn = await pool.getConnection();
        
        // 2. 💡 보안 핵심: 삭제하려는 기록(id)이 현재 로그인한 유저(user_id)의 것이 맞는지 확인
        const result = await conn.query(
            "DELETE FROM symptom_logs WHERE id = ? AND user_id = ?",
            [recordId, currentUserId]
        );

        if (result.affectedRows > 0) {
            res.json({ success: true, message: "기록이 정상적으로 삭제되었습니다." });
        } else {
            res.status(404).json({ success: false, message: "기록을 찾을 수 없거나 삭제 권한이 없습니다." });
        }
    } catch (err) {
        console.error("의료 기록 삭제 에러:", err);
        res.status(500).json({ error: "삭제 중 서버 오류가 발생했습니다." });
    } finally {
        if (conn) conn.release();
    }
});
// -----------------------------------------------------------------
// =================================================================
// [마이페이지 서브메뉴] 탭별 화면 렌더링 및 DB CRUD API (고도화 완료)
// =================================================================

// 1. 자주 가는 병원/약국 관리 (기존 유지)
app.get('/manage-places', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const currentUserId = req.session.user.userId;
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

// 2-A. [긴급 연락처] 화면 조회 (DB에서 해당 유저의 목록만 가져오기)
app.get('/emergency-contact', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const currentUserId = req.session.user.userId;
    let conn;
    try {
        conn = await pool.getConnection();
        const contacts = await conn.query("SELECT * FROM emergency_contacts WHERE user_id = ?", [currentUserId]);
        res.render('emergency-contact', { user: req.session.user, contacts: contacts });
    } catch (err) {
        console.error("보호자 조회 에러:", err);
        res.status(500).send("DB 조회 오류 발생");
    } finally {
        if (conn) conn.release();
    }
});

// 2-B. [긴급 연락처] 신규 등록 API (DB 추가)
app.post('/api/emergency-contact', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "로그인이 필요합니다." });
    const currentUserId = req.session.user.userId;
    const { name, phone } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            "INSERT INTO emergency_contacts (user_id, name, phone) VALUES (?, ?, ?)",
            [currentUserId, name, phone]
        );
        res.json({ success: true, insertId: Number(result.insertId) });
    } catch (err) {
        res.status(500).json({ error: "DB 저장 실패" });
    } finally {
        if (conn) conn.release();
    }
});

// 2-C. [긴급 연락처] 삭제 API (DB 삭제)
app.delete('/api/emergency-contact/:id', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "로그인이 필요합니다." });
    const currentUserId = req.session.user.userId;
    const contactId = req.params.id;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query("DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?", [contactId, currentUserId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "DB 삭제 실패" });
    } finally {
        if (conn) conn.release();
    }
});

// 👇👇👇 여기에 2번 SOS 호출 API 코드를 추가해 주세요! 👇👇👇

// ==========================================
// [API] 긴급 SOS 호출 처리 (POST /api/sos)
// ==========================================
app.post('/api/sos', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    
    const currentUserId = req.session.user.userId;
    const username = req.session.user.username;
    let conn;

    try {
        conn = await pool.getConnection();
        
        // 1. 등록된 긴급 연락처 조회
        const contacts = await conn.query(
            "SELECT name, phone FROM emergency_contacts WHERE user_id = ?", 
            [currentUserId]
        );

        if (contacts.length === 0) {
            return res.status(400).json({ success: false, message: "등록된 보호자 연락처가 없습니다. 마이페이지에서 먼저 등록해주세요." });
        }

        // 2. 실제 문자 발송 로직 (여기에 외부 SMS API 연동 필요)
        const phoneNumbers = contacts.map(c => c.phone);
        const sosMessage = `[MAS 긴급 알림] ${username}님에게 위급 상황이 발생했습니다. 즉시 연락을 취해주세요!`;
        
        // TODO: Solapi, CoolSMS, Twilio 등의 API를 사용해 phoneNumbers 배열로 문자(SMS) 전송
        console.log(`🚨 [SOS 발송 시뮬레이션] 수신자: ${phoneNumbers.join(', ')} / 메시지: ${sosMessage}`);

        res.json({ success: true, message: "SOS 전송 성공" });

    } catch (err) {
        console.error("SOS 호출 에러:", err);
        res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    } finally {
        if (conn) conn.release();
    }
});

// 3-A. [건강 알림] 화면 조회 (DB에서 해당 유저의 알림 목록 가져오기)
app.get('/health-alerts', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const currentUserId = req.session.user.userId;
    let conn;
    try {
        conn = await pool.getConnection();
        const alerts = await conn.query("SELECT * FROM health_alerts WHERE user_id = ?", [currentUserId]);
        res.render('health-alerts', { user: req.session.user, alerts: alerts });
    } catch (err) {
        res.status(500).send("DB 조회 오류 발생");
    } finally {
        if (conn) conn.release();
    }
});

// 3-B. [건강 알림] 신규 등록 API (DB 추가)
app.post('/api/health-alerts', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "로그인이 필요합니다." });
    const currentUserId = req.session.user.userId;
    const { name, time } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            "INSERT INTO health_alerts (user_id, name, time, is_active) VALUES (?, ?, ?, 0)",
            [currentUserId, name, time]
        );
        res.json({ success: true, insertId: Number(result.insertId) });
    } catch (err) {
        res.status(500).json({ error: "DB 저장 실패" });
    } finally {
        if (conn) conn.release();
    }
});

// 3-C. [건강 알림] 삭제 API (DB 삭제)
app.delete('/api/health-alerts/:id', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "로그인이 필요합니다." });
    const currentUserId = req.session.user.userId;
    const alertId = req.params.id;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query("DELETE FROM health_alerts WHERE id = ? AND user_id = ?", [alertId, currentUserId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "DB 삭제 실패" });
    } finally {
        if (conn) conn.release();
    }
});

// ==========================================
// [API] Gemini 처방전/약 봉지 스마트 사진 분석
// ==========================================
app.post('/api/analyze-prescription', upload.single('prescriptionImage'), async (req, res) => {
    // 로그인 체크
    if (!req.session.user) return res.status(401).json({ error: "로그인이 필요합니다." });
    // 파일 업로드 체크
    if (!req.file) return res.status(400).json({ error: "사진 파일이 업로드되지 않았습니다." });

    try {
        // 1. 이미지를 Gemini가 읽을 수 있는 base64 포맷으로 변환
        const imagePart = {
            inlineData: {
                data: req.file.buffer.toString("base64"),
                mimeType: req.file.mimetype
            },
        };

        // 2. Gemini 1.5 Flash 모델 로드 (이미지 분석용 초고속 모델)
        const aiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // 3. AI에게 내릴 정밀 명령문(프롬프트) 작성
        const prompt = `
        너는 지능형 의료 비서 MAS다. 제공된 처방전 또는 약 봉지 사진을 OCR 인식하여 다음 항목들을 분석해라.
        환자가 노약자라고 가정하고, 전문 용어는 빼고 초등학생도 이해할 수 있게 아주 쉽고 친절한 한국어로 작성해줘.

        [출력 양식]
        📋 1. 인식된 약 이름 및 성분: (여기에 작성)
        🎯 2. 주요 효능 및 효과: (여기에 작성)
        ⏰ 3. 올바른 복용 방법 (언제 먹나요?): (여기에 작성)
        ⚠️ 4. 절대 주의사항 및 부작용: (여기에 작성)

        만약 업로드된 사진이 의료 관련 문서(처방전, 약전, 약 봉지)가 아니거나 글자를 전혀 알아볼 수 없다면, 
        "⚠️ 처방전 또는 약 봉지 사진을 명확하게 다시 촬영해 주세요." 라고만 출력해라.
        `;

        // 4. Gemini에게 이미지와 프롬프트 전달 후 분석 요청
        const result = await aiModel.generateContent([prompt, imagePart]);
        const analysisText = result.response.text();

       // 5. 프론트엔드로 분석 결과 전달
        res.json({ success: true, analysis: analysisText });

    } catch (err) {
        console.error("Gemini 이미지 분석 에러:", err);
        res.status(500).json({ error: "AI가 사진을 분석하는 중 오류가 발생했습니다." });
    }
}); 
// 💡 수정: 처방전 분석 API를 여기서 확실히 닫아줍니다!

// =================================================================
// 1. [자주 가는 병원/약국 관리] DB CRUD API
// =================================================================

// 1-A. 화면 조회 (DB에서 데이터 가져오기)
app.get('/manage-places', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const currentUserId = req.session.user.userId;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query("USE dr_mas_db"); // 방 이름 확실히 지정!
        const places = await conn.query("SELECT * FROM favorite_places WHERE user_id = ?", [currentUserId]);
        res.render('manage-places', { 
            user: req.session.user, 
            places: places,
            kakaoJsKey: process.env.KAKAO_JS_KEY
        });
    } catch (err) {
        console.error("병원/약국 조회 에러:", err);
        res.status(500).send("DB 조회 오류 발생");
    } finally {
        if (conn) conn.release();
    }
});

// 1-B. 신규 등록 API (DB에 추가) - 메모 기능 포함!
app.post('/api/places', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "로그인이 필요합니다." });
    const currentUserId = req.session.user.userId;
    
    // 💡 프론트엔드에서 memo 값도 같이 받아옵니다.
    const { type, name, address, phone, memo } = req.body; 
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query("USE dr_mas_db");
        
        // 💡 INSERT 쿼리에 memo 칸도 추가해줍니다.
        const result = await conn.query(
            "INSERT INTO favorite_places (user_id, type, name, address, phone, memo) VALUES (?, ?, ?, ?, ?, ?)",
            [currentUserId, type, name, address, phone, memo]
        );
        res.json({ success: true, insertId: Number(result.insertId) });
    } catch (err) {
        console.error("저장 에러:", err);
        res.status(500).json({ error: "DB 저장 실패" });
    } finally {
        if (conn) conn.release();
    }
});;

// 1-C. 삭제 API (DB에서 삭제)
app.delete('/api/places/:id', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "로그인이 필요합니다." });
    const currentUserId = req.session.user.userId;
    const placeId = req.params.id;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query("USE dr_mas_db");
        await conn.query("DELETE FROM favorite_places WHERE id = ? AND user_id = ?", [placeId, currentUserId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "DB 삭제 실패" });
    } finally {
        if (conn) conn.release();
    }
});

const PORT = process.env.PORT || 3000;
// ==========================================
// 🛠️ [최종 완벽] 클라우드 DB 테이블 자동 생성 및 초기화 함수
// =================================================================
async function initCloudDatabase() {
    let conn;
    try {
        // 특정 데이터베이스 지정 없이 순수하게 도어 오픈
        conn = await pool.getConnection();
        console.log("⏳ [DB 마이그레이션] 클라우드 DB 대문 접속 성공! 'dr_mas_db' 생성 확인 중...");
        
        // 1. 'dr_mas_db' 방이 없으면 무조건 강제 새로 생성
        await conn.query("CREATE DATABASE IF NOT EXISTS dr_mas_db");
        
        // 2. ⭐️ 중요: 이제부터 생성되는 테이블들은 모두 'dr_mas_db' 방 안에 넣겠다는 선언
        await conn.query("USE dr_mas_db");
        console.log("✅ [DB 마이그레이션] 'dr_mas_db' 데이터베이스 방 확보 및 진입 성공!");

        // 3. 유저 테이블 생성
        await conn.query(`
            CREATE TABLE IF NOT EXISTS Users (
                user_id INT AUTO_INCREMENT PRIMARY KEY,
                login_id VARCHAR(50) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                username VARCHAR(100) NOT NULL,
                age INT,
                gender VARCHAR(10),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 4. AI 진단 기록 테이블 생성
        await conn.query(`
            CREATE TABLE IF NOT EXISTS symptom_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                symptom_text TEXT NOT NULL,
                ai_predicted_disease VARCHAR(255),
                ai_guide TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 5. 긴급 연락처 테이블 생성
        await conn.query(`
            CREATE TABLE IF NOT EXISTS emergency_contacts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                name VARCHAR(100) NOT NULL,
                phone VARCHAR(50) NOT NULL
            )
        `);

        // 6. 건강 알림 설정 테이블 생성
        await conn.query(`
            CREATE TABLE IF NOT EXISTS health_alerts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                time VARCHAR(50) NOT NULL,
                is_active TINYINT(1) DEFAULT 0
            )
        `);
        // 7. 자주 가는 병원/약국 테이블 생성 (memo 컬럼 포함)
        await conn.query(`
            CREATE TABLE IF NOT EXISTS favorite_places (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                type VARCHAR(50) NOT NULL,
                name VARCHAR(100) NOT NULL,
                address VARCHAR(255),
                phone VARCHAR(50),
                memo TEXT
            )
        `);
        
        // 💡 [치트키] 만약 이미 방금 전 배포로 테이블이 만들어져 있다면, 
        // 기존 테이블을 부수지 않고 memo 칸만 쏙 추가해주는 안전 장치입니다!
        try {
            await conn.query("ALTER TABLE favorite_places ADD COLUMN memo TEXT");
        } catch(e) {
            // 이미 memo 칸이 있으면 에러가 나지만 가볍게 무시하고 넘어갑니다.
        }

        console.log("🚀 [DB 마이그레이션] 모든 테이블 설계도면이 완벽하게 세팅되었습니다!");

    } catch (err) {
        console.error("❌ [DB 마이그레이션 에러] 자동 생성 중 오류 발생:", err);
    } finally {
        if (conn) conn.release();
    }
}

// 🚀 서버 가동 트리거
app.listen(3000, async () => {
    console.log("🚀 MAS 서버가 3000번 포트에서 가동 중입니다!");
    await initCloudDatabase(); 
});