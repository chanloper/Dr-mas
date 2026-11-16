const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,URL,Math,Number,require:n=>n==='react/jsx-runtime'?require(n):n in mocks?mocks[n]:(()=>{throw Error(n)})()});return exports;}
const geo=load('src/services/placeMap.ts');const contract=load('src/services/placeContract.ts');
const p=(id,latitude,longitude)=>({id,name:'가상 기관 '+id,category:'가상',address:'테스트 주소',roadAddress:'',phone:'',distanceMeters:null,detailUrl:'https://place.map.kakao.com/'+id,...(latitude!==undefined?{coordinates:{latitude,longitude}}:{})});
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
test('Kakao x/y become optional WGS84 coordinates; old responses remain compatible',()=>{
 const query={category:'hospital',mode:'keyword',query:'가상',page:1};
 const doc={id:'1',place_name:'가상',category_group_code:'HP8',category_name:'병원',address_name:'테스트',road_address_name:'',phone:'',place_url:'https://place.map.kakao.com/1',x:'126.978',y:'37.5665'};
 const result=contract.normalizeKakao({documents:[doc],meta:{is_end:true}},query);
 assert.equal(result.places[0].coordinates.latitude,37.5665);assert.equal(result.places[0].coordinates.longitude,126.978);
 assert.equal(contract.validateResult({places:[p('1')],isEnd:true}).places[0].coordinates,undefined);
 assert.throws(()=>contract.validateResult({places:[p('1',126,37)],isEnd:true}));
});
test('Web Mercator roundtrip and fit keep actual markers within the viewport',()=>{
 const place=p('1',37.5665,126.978);const xy=geo.project(place.coordinates,14);const back=geo.unproject(xy.x,xy.y,14);assert.ok(Math.abs(back.latitude-place.coordinates.latitude)<1e-7);assert.ok(Math.abs(back.longitude-place.coordinates.longitude)<1e-7);
 const places=[place,p('2',37.6,127.01)];const fit=geo.fitPlaces(places,320,300);const center=geo.project(fit,fit.zoom);
 for(const place of places){const point=geo.project(place.coordinates,fit.zoom);assert.ok(Math.abs(point.x-center.x)<160);assert.ok(Math.abs(point.y-center.y)<150);}
 const tiles=geo.visibleTiles(fit,fit.zoom,320,300);assert.ok(tiles.length<=9);assert.ok(tiles.every(t=>t.url.startsWith('https://tile.openstreetmap.org/')));
 assert.equal(geo.fitPlaces([p('1')],320,300),null);assert.equal(geo.mappedPlaces([p('1',NaN,127),p('2')]).length,0);
});
test('drag pans the map with the pointer and anchored zoom keeps the pointed coordinate fixed',()=>{
 const center={latitude:37.5665,longitude:126.978,zoom:13},width=320,height=300,point={x:74,y:92};
 const before=geo.project(center,center.zoom),offsetX=point.x-width/2,offsetY=point.y-height/2;
 const anchor=geo.unproject(before.x+offsetX,before.y+offsetY,center.zoom);
 const zoomed=geo.zoomAt(center,center.zoom+2,point,width,height),after=geo.project(zoomed,zoomed.zoom);
 const anchoredAfter=geo.unproject(after.x+offsetX,after.y+offsetY,zoomed.zoom);
 assert.ok(Math.abs(anchor.latitude-anchoredAfter.latitude)<1e-8);
 assert.ok(Math.abs(anchor.longitude-anchoredAfter.longitude)<1e-8);
 const dragged=geo.panCenter(center,45,-28),draggedPixels=geo.project(dragged,dragged.zoom);
 assert.ok(Math.abs(draggedPixels.x-(before.x-45))<1e-6);assert.ok(Math.abs(draggedPixels.y-(before.y+28))<1e-6);
 assert.equal(geo.zoomAt(center,99,point,width,height).zoom,18);
 assert.equal(geo.zoomAt(center,-99,point,width,height).zoom,5);
});
test('map loads only after user action, markers select real records and failures keep lists usable',()=>{
 let slots=[],cursor=0;const hooks={useCallback:fn=>fn,useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}];},useRef:v=>{const i=cursor++;return slots[i]??(slots[i]={current:v});},useEffect:()=>{cursor++;}};
 const native=Object.fromEntries(['Image','Pressable','Text','View'].map(k=>[k,k]));const selected=[];
 const useSharedValue=value=>{const i=cursor++;return slots[i]??(slots[i]={value})};
 const useGesture=config=>{cursor++;return{config}};
 const {PlaceMap}=load('src/components/PlaceMap.tsx',{react:hooks,'./MapTile':{MapTile:'Image'},'react-native':{...native,Platform:{OS:'web'},StyleSheet:{absoluteFill:{}},Linking:{openURL:async()=>{}}},'react-native-gesture-handler':{GestureDetector:'GestureDetector',MouseButton:{LEFT:1},usePanGesture:useGesture,usePinchGesture:useGesture,useSimultaneousGestures:(...gestures)=>{cursor++;return{gestures}}},'react-native-reanimated':{default:{View:'AnimatedView'},runOnJS:fn=>fn,useSharedValue,useAnimatedStyle:fn=>{cursor++;return fn();}},'../services/placeMap':geo,'./ui':{Action:'Action',C:{},s:{}}});
 const props={places:[p('1',37.5665,126.978),p('2',37.567,126.979)],selected:null,onSelect:p=>selected.push(p.id),onDetails:()=>{}};
 const render=()=>{cursor=0;return PlaceMap(props)};
 let tree=render();assert.equal(nodes(tree).filter(n=>n.type==='Image').length,0);nodes(tree).find(n=>n.props?.label==='지도 보기').props.onPress();
 tree=render();const viewport=nodes(tree).find(n=>typeof n.type==='function');assert.ok(viewport);slots=[];cursor=0;
 let all=nodes(viewport.type(viewport.props));const detector=all.find(n=>n.type==='GestureDetector');assert.equal(detector.props.touchAction,'none');assert.equal(detector.props.userSelect,'none');
 const [panGesture,pinchGesture]=detector.props.gesture.gestures;assert.equal(panGesture.config.maxPointers,1);assert.equal(panGesture.config.mouseButton,1);assert.equal(typeof pinchGesture.config.onUpdate,'function');
 const markers=all.filter(n=>n.props?.accessibilityLabel?.includes('지도에서 선택'));assert.equal(markers.length,2);markers[1].props.onPress();assert.deepEqual(selected,['2']);
 all.find(n=>n.type==='Image').props.onError();cursor=0;all=nodes(viewport.type(viewport.props));assert.ok(all.some(n=>typeof n.props?.children==='string'&&n.props.children.includes('불러오지 못했어요')));
 assert.equal(all.filter(n=>n.props?.accessibilityRole==='link').length,1);
});
test('place list and map share selection; list selection scrolls to the actual map and details remain available',()=>{
 let slots=[],cursor=0;const refs=[];let refCursor=0;const hooks={useCallback:fn=>fn,useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}];},useRef:v=>{const i=refCursor++;return refs[i]??(refs[i]={current:v});}};
 const native=Object.fromEntries(['ActivityIndicator','KeyboardAvoidingView','Pressable','ScrollView','Text','View'].map(k=>[k,k]));
 const search={category:'hospital',places:[p('1',37.5665,126.978),p('2',37.567,126.979)],searched:true,loading:false,keyword:'가상',isEnd:true,changeKeyword(){},chooseCategory(){},run(){}};
 const screen=load('src/app/places.tsx',{'react-native':{...native,Linking:{openURL:async()=>{}},Platform:{OS:'web'},useWindowDimensions:()=>({width:360})},react:hooks,'expo-router':{useLocalSearchParams:()=>({}),useRouter:()=>({})},'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'../components/ui':{Action:'Action',Panel:'Panel',Field:'Field',StatusMessage:'StatusMessage',C:{},s:{}},'../features/places/usePlaceSearch':{usePlaceSearch:()=>search},'../services/placeContract':contract,'../services/places':{placeSearchConfigured:()=>true},'../components/EmergencyCallButton':{EmergencyCallButton:'EmergencyCallButton'},'../components/PlaceDetailsModal':{PlaceDetailsModal:'PlaceDetailsModal'},'../services/placeRoute':{placeRouteCategory:()=> 'hospital'},'../components/HiraReferencePanel':{HiraReferencePanel:'HiraReferencePanel'},'../components/PlaceMap':{PlaceMap:'PlaceMap'}});
 const entry=screen.default();const render=()=>{cursor=0;refCursor=0;return nodes(entry.type(entry.props));};let all=render();let scrolled=0;refs[0].current={scrollTo:()=>scrolled++};
 all.find(n=>n.props?.accessibilityLabel==='가상 기관 2, 지도에서 선택').props.onPress();all=render();assert.equal(all.find(n=>n.type==='PlaceMap').props.selected.id,'2');assert.equal(scrolled,1);
 all.find(n=>n.type==='PlaceMap').props.onSelect(search.places[0]);all=render();assert.equal(all.find(n=>n.props?.accessibilityLabel==='가상 기관 1, 지도에서 선택').props.accessibilityState.selected,true);
 all.find(n=>n.props?.label==='가상 기관 1 상세 보기').props.onPress();all=render();assert.equal(all.find(n=>n.type==='PlaceDetailsModal').props.visible,true);
});
