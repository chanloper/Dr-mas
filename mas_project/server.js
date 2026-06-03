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
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: 3306,
    connectionLimit: 5
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

    } catch (err) {
        console.error(err);
        res.write("\n\n서버 통신 중 에러가 발생했습니다.");
        res.end();
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
app.get('/manage-places', (req, res) => {
    res.render('manage-places', { user: req.session.user || { username: "김실험" } });
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 MAS 서버가 ${PORT}번 포트에서 가동 중입니다!`));