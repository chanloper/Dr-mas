require('dotenv').config();
const express = require('express');
const mariadb = require('mariadb');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const path = require('path'); // EJS 경로 설정을 위한 모듈

// 1. 여기서 app을 가장 먼저 탄생시켜야 합니다!
const app = express(); 

// 🌟 2. app이 만들어진 이후에 각종 설정을 붙여줍니다.
app.use(cors());
app.use(express.json());

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
    res.render('chat', { title: "MAS AI Assistant" });
});

// 하드코딩이 아닌 .env 파일 변수를 참조할 수 있도록 코드 수정
const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: 3306, // .env의 PORT를 숫자로 변환
    connectionLimit: 5
});

// 2. Gemini AI 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/chat', async (req, res) => {
    const { userId, symptomText, userLat, userLng } = req.body;

    try {
        const PUBLIC_API_KEY = process.env.PUBLIC_API_KEY;

        // --- 구역 1: 질병 API 호출 ---
        let diseaseData = "현재 데이터 서버 통신 지연으로 AI 기본 지식을 활용합니다.";
        // (기존 API 호출 로직 생략 - 필요시 말씀해주세요)

       // --- 구역 2: 카카오 로컬 API로 주변 병원/약국 찾기 ---
        let localMedicalData = { hospitals: [], pharmacies: [] };

        // 프론트엔드에서 위치 정보를 보냈을 때만 실행
        if (userLat && userLng) {
            try {
                // 주의: .env 파일에 KAKAO_REST_API_KEY=본인키 를 꼭 추가해야 합니다!
                const KAKAO_KEY = process.env.KAKAO_REST_API_KEY; 
                
                // 병원 검색 (카테고리 코드: HP8, 반경 2km 이내, 거리순 정렬)
                const hospRes = await axios.get(
                    `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=HP8&y=${userLat}&x=${userLng}&radius=2000&sort=distance`,
                    { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } }
                );
                
                // 약국 검색 (카테고리 코드: PM9, 반경 2km 이내, 거리순 정렬)
                const pharmRes = await axios.get(
                    `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=PM9&y=${userLat}&x=${userLng}&radius=2000&sort=distance`,
                    { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } }
                );

                // AI가 헷갈리지 않게 가장 가까운 3곳의 이름과 거리만 추출해서 배열로 만듭니다.
                localMedicalData.hospitals = hospRes.data.documents.slice(0, 3).map(d => `${d.place_name}(${d.distance}m 거리)`);
                localMedicalData.pharmacies = pharmRes.data.documents.slice(0, 3).map(d => `${d.place_name}(${d.distance}m 거리)`);
                
            } catch (error) {
                console.error("카카오 API 호출 에러:", error.message);
            }
        }

        // --- 구역 3: Gemini 분석 (JSON 강제 모드 유지) ---
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        // 🌟 핵심: 프롬프트에 대상(노인 및 1인 가구)을 명시하고, 검색해 온 병원/약국 데이터를 주입합니다.
        const prompt = `너는 청년과 중장년층 및 1인 가구를 위한 지능형 의료 비서 'Dr. MAS'야. 
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
            // 이제 AI가 무조건 깔끔한 JSON을 주므로, 복잡한 정규식 없이 바로 파싱합니다!
            aiResult = JSON.parse(result.response.text());
        } catch (e) {
            console.error("JSON 파싱 에러:", e);
            aiResult = { predictedDisease: "분석 지연", guide: "데이터를 정리하는 중입니다. 다시 한번 증상을 입력해주세요." };
        }

        // --- 구역 4: DB 저장 및 응답 --- 
        // schema.sql에 정의된 구조에 맞게 코드 수정
        const conn = await pool.getConnection();
        await conn.query(
    "INSERT INTO symptom_logs (user_id, symptom_text, ai_predicted_disease, ai_guide) VALUES (?, ?, ?, ?)",
    [userId, symptomText, aiResult.predictedDisease, aiResult.guide]
);
        conn.release();

        res.json(aiResult);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "서버 에러 발생" });
    }
});

app.listen(3000, () => {
    console.log("🚀 Dr. MAS 서버가 3000번 포트에서 가동 중입니다!");
});
