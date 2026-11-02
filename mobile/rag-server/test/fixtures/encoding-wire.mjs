const expected={question:'잠들기가 힘들어요',title:'휴식 자료',content:'야간 수면과 취침 환경',message:'확인된 자료가 부족하여 답변할 수 없습니다'};
if(process.argv[2]==='echo'){
 let input='';for await(const c of process.stdin)input+=c.toString('utf8');
 console.log(JSON.stringify({matches:input.trim()===expected.question}));
}else console.log(JSON.stringify(expected));
