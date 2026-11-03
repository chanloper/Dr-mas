import {createSyntheticChat,syntheticChatDocuments} from './synthetic-chat.js';
// No env file, disk repository, Auth verifier, HTTP server or Gemini client.
try{
 const chat=await createSyntheticChat('development');
 const cases=[['합성안내카드알파','synthetic_card_alpha'],['합성안내카드베타','synthetic_card_beta']];
 for(const [question,id]of cases){
  const result=await chat(question!);const source=result.sources[0];const doc=syntheticChatDocuments.find(d=>d.id===id);
  if(result.status!=='local_evidence'||result.mode!=='synthetic'||result.sources.length!==1||!source||!doc||source.documentId!==id||source.quote!==doc.content||source.title!==doc.title||source.sourceUrl!==doc.sourceUrl)throw new Error();
 }
 const empty=await chat('우주선감마');
 if(empty.status!=='insufficient_evidence'||empty.sources.length)throw new Error();
 console.log(JSON.stringify({result:'PASS',mode:'synthetic',sourceChecks:cases.length,abstentionChecks:1,externalCalls:0}));
}catch{console.error('SYNTHETIC_CHECK_FAILED');process.exitCode=1;}
