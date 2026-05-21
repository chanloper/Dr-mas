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
    port: parseInt(process.env.PORT, 10),
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
            systemInstruction: "너는 지능형 의료 비서 'MAS'야. 반드시 [질환]과 [가이드]라는 두 가지 섹션으로 나누어 대답하고, JSON 양식은 절대 사용하지 마."
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
                
                const dbDisease = diseaseMatch ? diseaseMatch[1].trim() : "분석 불가";
                const dbGuide = guideMatch ? guideMatch[1].trim() : aiFullText;

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
app.listen(3000, () => console.log("🚀 MAS 서버가 3000번 포트에서 가동 중입니다!"));