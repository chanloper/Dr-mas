require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mariadb = require('mariadb');
const cors = require('cors');

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
    secret: 'dr-mas-secret-key', // 암호화 키
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 } // 1시간 동안 세션 유지
}));

// --- EJS 설정 ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'backend', 'public')));

// --- 메인 페이지 (/) 접속 시 메인 랜딩 화면 그려주기 ---
app.get('/', (req, res) => {
    res.render('main'); 
});

// --- 기존 채팅 화면은 /chat 경로로 분리 ---
app.get('/chat', (req, res) => {
    // 💡 세션 검증: 로그인하지 않은 사용자가 /chat에 접근하면 로그인 페이지로 리다이렉트
    if (!req.session.user) {
        return res.redirect('/login');
    }
    // 💡 로그인된 사용자 정보를 템플릿(chat.ejs)으로 전달
    res.render('chat', { title: "MAS AI Assistant", user: req.session.user });
});

// --- 로그인 화면 ---
app.get('/login', (req, res) => {
    res.render('login');
});

// --- 회원가입 화면 ---
app.get('/register', (req, res) => {
    res.render('register');
});

// 데이터베이스 커넥션 풀 설정
const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: parseInt(process.env.PORT, 10),
    connectionLimit: 5
});

// ===================================================================================

// Gemini AI 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/chat', async (req, res) => {
    const { symptomText, userLat, userLng } = req.body;
    
    // 💡 프론트엔드에서 보낸 하드코딩된 userId 대신, 안전한 세션의 userId를 사용
    const currentUserId = req.session.user ? req.session.user.userId : 1; 

    try {
        const PUBLIC_API_KEY = process.env.PUBLIC_API_KEY;

        // --- 구역 1: 질병 API 호출 ---
        let diseaseData = "현재 데이터 서버 통신 지연으로 AI 기본 지식을 활용합니다.";

       // --- 구역 2: 카카오 로컬 API로 주변 병원/약국 찾기 ---
        let localMedicalData = { hospitals: [], pharmacies: [] };

        if (userLat && userLng) {
            try {
                const KAKAO_KEY = process.env.KAKAO_REST_API_KEY; 
                
                const hospRes = await axios.get(
                    `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=HP8&y=${userLat}&x=${userLng}&radius=2000&sort=distance`,
                    { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } }
                );
                
                const pharmRes = await axios.get(
                    `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=PM9&y=${userLat}&x=${userLng}&radius=2000&sort=distance`,
                    { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } }
                );

                localMedicalData.hospitals = hospRes.data.documents.slice(0, 3).map(d => `${d.place_name}(${d.distance}m 거리)`);
                localMedicalData.pharmacies = pharmRes.data.documents.slice(0, 3).map(d => `${d.place_name}(${d.distance}m 거리)`);
                
            } catch (error) {
                console.error("카카오 API 호출 에러:", error.message);
            }
        }

        // --- 구역 3: Gemini 분석 ---
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `너는 청년과 중장년층 및 1인 가구를 위한 지능형 의료 비서 'MAS'야. 
        사용자의 [증상]: "${symptomText}"을 바탕으로 분석해줘.
        
        [현재 위치 기반 추천 데이터] 
        - 주변 병원: ${localMedicalData.hospitals.join(', ') || '검색된 병원 없음'}
        - 주변 약국: ${localMedicalData.pharmacies.join(', ') || '검색된 약국 없음'}
        
        반드시 아래 JSON 스키마를 엄격하게 지켜서 답변해:
        {"predictedDisease": "질환1, 질환2", "guide": "공감 멘트 + 증상 완화 팁 + [추천 데이터]를 활용해 가장 적합한 병원이나 약국을 콕 집어서 안내하는 멘트 포함 (줄바꿈이 필요하면 반드시 \\n 문자를 사용할 것)"}`;

        let result;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            try {
                result = await model.generateContent(prompt);
                break; 
            } catch (error) {
                retryCount++;
                console.log(`⚠️ AI 재시도 (${retryCount}/${maxRetries})`);
                if (retryCount === maxRetries) throw error; 
                await new Promise(res => setTimeout(res, 2000)); 
            }
        }

        let aiResult;
        try {
            aiResult = JSON.parse(result.response.text());
        } catch (e) {
            console.error("JSON 파싱 에러:", e);
            aiResult = { predictedDisease: "분석 지연", guide: "데이터를 정리하는 중입니다. 다시 한번 증상을 입력해주세요." };
        }

        // --- 구역 4: DB 저장 및 응답 --- 
        const conn = await pool.getConnection();
        await conn.query(
            "INSERT INTO symptom_logs (user_id, symptom_text, ai_predicted_disease, ai_guide) VALUES (?, ?, ?, ?)",
            [currentUserId, symptomText, aiResult.predictedDisease, aiResult.guide] // 💡 세션의 유저 ID로 저장
        );
        conn.release();

        res.json(aiResult);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "서버 에러 발생" });
    }
});

app.listen(3000, () => {
    console.log("🚀 MAS 서버가 3000번 포트에서 가동 중입니다!");
});

// ===================================================================================

// ==========================================
// [API] 회원가입 처리 (POST /api/register)
// ==========================================

app.post('/api/register', async (req, res) => {
    const { username, loginId, password, age, gender } = req.body;
    let conn;

    try {
        conn = await pool.getConnection();

        const rows = await conn.query("SELECT user_id FROM Users WHERE login_id = ?", [loginId]);
        if (rows.length > 0) {
            return res.status(400).send('<script>alert("이미 존재하는 아이디입니다."); history.back();</script>');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const parsedAge = age ? parseInt(age, 10) : null;
        const selectedGender = gender === "" ? null : gender;

        await conn.query(
            "INSERT INTO Users (login_id, password, username, age, gender) VALUES (?, ?, ?, ?, ?)",
            [loginId, hashedPassword, username, parsedAge, selectedGender]
        );

        res.send('<script>alert("회원가입이 완료되었습니다."); location.href="/login";</script>');

    } catch (err) {
        console.error("회원가입 에러:", err);
        res.status(500).send('<script>alert("서버 오류가 발생했습니다."); history.back();</script>');
    } finally {
        if (conn) conn.release();
    }
});

// ==========================================
// [API] 로그인 처리 (POST /api/login)
// ==========================================

app.post('/api/login', async (req, res) => {
    const { loginId, password } = req.body;
    let conn;

    try {
        conn = await pool.getConnection();

        const rows = await conn.query("SELECT * FROM Users WHERE login_id = ?", [loginId]);
        if (rows.length === 0) {
            return res.status(400).send('<script>alert("아이디 또는 비밀번호가 일치하지 않습니다."); history.back();</script>');
        }

        const user = rows[0];

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).send('<script>alert("아이디 또는 비밀번호가 일치하지 않습니다."); history.back();</script>');
        }

        // 💡 로그인 성공 시 해당 유저의 식별키(id)와 실명을 서버 세션에 기록합니다.
        req.session.user = {
            userId: user.user_id,
            username: user.username
        };

        res.send(`<script>alert("${user.username}님 환영합니다!"); location.href="/chat";</script>`);

    } catch (err) {
        console.error("로그인 에러:", err);
        res.status(500).send('<script>alert("서버 오류가 발생했습니다."); history.back();</script>');
    } finally {
        if (conn) conn.release();
    }
});

// ==========================================
// [API] 나의 의료 기록 조회 (GET /api/records)
// ==========================================

app.post('/api/records', async (req, res) => {
    // 세션 체크: 로그인하지 않은 경우 차단
    if (!req.session.user) {
        return res.status(401).json({ error: "로그인이 필요합니다." });
    }

    const currentUserId = req.session.user.userId;
    let conn;

    try {
        conn = await pool.getConnection();
        
        // 해당 유저의 증상 기록을 최신순(created_at DESC)으로 조회
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