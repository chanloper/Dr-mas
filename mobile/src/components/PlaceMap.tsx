import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, MouseButton, usePanGesture, usePinchGesture, useSimultaneousGestures } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { MapTile } from './MapTile';
import type { Place } from '../services/placeContract';
import { fitPlaces, mappedPlaces, panCenter, project, visibleTiles, zoomAt } from '../services/placeMap';
import { Action, C, s } from './ui';

type Props = { places: Place[]; selected: Place | null; onSelect: (place: Place) => void; onDetails: (place: Place) => void };
export function PlaceMap(props: Props) {
  const [enabled,setEnabled]=useState(false);
  const points=mappedPlaces(props.places);
  return <View style={[s.panel,{gap:12,marginTop:18}]}>
    <Text style={s.sectionTitle}>지도에서 위치 확인</Text>
    {!points.length ? <Text style={s.paragraph}>검색 서버가 좌표를 제공하면 지도에 표시돼요. 지금은 기관 상세에서 카카오맵을 열어 위치를 확인해 주세요.</Text>
      : !enabled ? <><Text style={s.caption}>지도를 열면 표시 지역과 기기 네트워크 정보가 OpenStreetMap에 전달돼요. 상담 내용·로그인 정보는 보내지 않아요.</Text><Action label="지도 보기" onPress={()=>setEnabled(true)} /></>
      : <><MapViewport key={props.places.map(p=>p.id).join(',')} {...props} />
        <Text style={s.caption}>번호는 아래 목록과 같아요. {props.places.length-points.length>0?`좌표 없는 ${props.places.length-points.length}곳은 목록에서 확인해 주세요.`:''}</Text>
        {props.selected && <View style={{gap:6}}><Text style={s.bodyStrong}>{props.selected.name}</Text><Text style={s.paragraph}>{props.selected.roadAddress||props.selected.address}</Text><Text style={s.caption}>{props.selected.phone||'전화번호 정보 없음'}{props.selected.distanceMeters!==null?` · ${Math.round(props.selected.distanceMeters)}m`:''}</Text><Action label="기관 상세 · 카카오맵" outline onPress={()=>props.onDetails(props.selected!)} /></View>}
      </>}
  </View>;
}
function MapViewport({places,selected,onSelect}:Props) {
  const [width,setWidth]=useState(300),[view,setView]=useState<ReturnType<typeof fitPlaces>>(null),[failed,setFailed]=useState(false),[loaded,setLoaded]=useState<Record<string,boolean>>({});
  const mapRef=useRef<HTMLElement|null>(null);
  const tileFailed=useCallback(()=>setFailed(true),[]);
  const height=300,fit=fitPlaces(selected?.coordinates?[selected]:places,width,height)!;
  const center=view??fit,origin=project(center,center.zoom);
  const tiles=visibleTiles(center,center.zoom,width,height);
  const panX=useSharedValue(0),panY=useSharedValue(0),pinchScale=useSharedValue(1),focalX=useSharedValue(0),focalY=useSharedValue(0),pinching=useSharedValue(false),pinchPanX=useSharedValue(0),pinchPanY=useSharedValue(0);
  const commitPan=(x:number,y:number)=>{if(Math.abs(x)>0.1||Math.abs(y)>0.1)setView(panCenter(center,x,y));};
  const commitPinch=(scale:number,x:number,y:number,carryX:number,carryY:number)=>{
    const zoom=Math.max(5,Math.min(18,Math.round(center.zoom+Math.log2(scale))));
    const panned=panCenter(center,carryX,carryY);
    setView(zoomAt(panned,zoom,{x,y},width,height));
  };
  const pan=usePanGesture({minDistance:5,maxPointers:1,averageTouches:true,mouseButton:MouseButton.LEFT,activeCursor:'grabbing',
    onUpdate:event=>{if(!pinching.value){panX.value=event.translationX;panY.value=event.translationY;}},
    onDeactivate:()=>{if(!pinching.value)runOnJS(commitPan)(panX.value,panY.value);panX.value=0;panY.value=0;},
    onFinalize:()=>{panX.value=0;panY.value=0;},
  });
  const pinch=usePinchGesture({
    onActivate:()=>{pinching.value=true;pinchPanX.value=panX.value;pinchPanY.value=panY.value;panX.value=0;panY.value=0;pinchScale.value=1;},
    onUpdate:event=>{pinchScale.value=Math.max(2**(5-center.zoom),Math.min(2**(18-center.zoom),event.scale));focalX.value=event.focalX-width/2;focalY.value=event.focalY-height/2;},
    onDeactivate:()=>{runOnJS(commitPinch)(pinchScale.value,focalX.value+width/2,focalY.value+height/2,pinchPanX.value,pinchPanY.value);pinching.value=false;pinchScale.value=1;focalX.value=0;focalY.value=0;pinchPanX.value=0;pinchPanY.value=0;},
    onFinalize:()=>{pinching.value=false;pinchScale.value=1;focalX.value=0;focalY.value=0;},
  });
  const gesture=useSimultaneousGestures(pan,pinch);
  useEffect(()=>{
    if(Platform.OS!=='web')return;
    const element=mapRef.current;
    if(!element)return;
    const onWheel=(event:WheelEvent)=>{
      const zoom=Math.max(5,Math.min(18,center.zoom+(event.deltaY<0?1:-1)));
      if(zoom===center.zoom)return;
      event.preventDefault();
      const rect=element.getBoundingClientRect();
      setView(zoomAt(center,zoom,{x:event.clientX-rect.left,y:event.clientY-rect.top},width,height));
    };
    element.addEventListener('wheel',onWheel,{passive:false});
    return ()=>element.removeEventListener('wheel',onWheel);
  },[center,width,height]);
  const movingLayer=useAnimatedStyle(()=>({transform:[
    {translateX:panX.value+focalX.value*(1-pinchScale.value)},
    {translateY:panY.value+focalY.value*(1-pinchScale.value)},
    {scale:pinchScale.value},
  ]}));
  const move=(dx:number,dy:number)=>setView(panCenter(center,-dx,-dy));
  const changeZoom=(delta:number)=>setView(zoomAt(center,center.zoom+delta,{x:width/2,y:height/2},width,height));
  return <><View ref={node=>{mapRef.current=node as unknown as HTMLElement|null;}} onLayout={e=>setWidth(Math.max(160,e.nativeEvent.layout.width))} style={{height,backgroundColor:C.mint,borderRadius:18,overflow:'hidden',position:'relative'}} accessibilityLabel="검색 결과 위치 지도">
    <GestureDetector gesture={gesture} touchAction={Platform.OS==='web'?'none':undefined} userSelect={Platform.OS==='web'?'none':undefined}>
      <Animated.View style={[StyleSheet.absoluteFill,movingLayer]}>
        {!failed && tiles.map(tile=><MapTile key={tile.key} accessible={false} url={tile.url} style={{position:'absolute',left:tile.left,top:tile.top,width:256,height:256}} onLoad={()=>setLoaded(current=>({...current,[tile.key]:true}))} onError={tileFailed} />)}
        {mappedPlaces(places).sort((a,b)=>Number(a.id===selected?.id)-Number(b.id===selected?.id)).map(place=>{const p=project(place.coordinates,center.zoom),x=p.x-origin.x+width/2,y=p.y-origin.y+height/2;
          if(x<0||x>width||y<0||y>height)return null;
          return <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`${place.name}, 지도에서 선택`} accessibilityState={{selected:selected?.id===place.id}} onPress={()=>onSelect(place)} style={{position:'absolute',left:x-24,top:y-24,width:48,height:48,alignItems:'center',justifyContent:'center'}}><View style={{height:32,minWidth:32,paddingHorizontal:6,borderRadius:16,backgroundColor:selected?.id===place.id?C.navy:C.blue,borderWidth:2,borderColor:C.white,alignItems:'center',justifyContent:'center'}}><Text style={{color:C.white,fontSize:16,fontWeight:'700'}}>{places.findIndex(p=>p.id===place.id)+1}</Text></View></Pressable>;
        })}
      </Animated.View>
    </GestureDetector>
    {!failed&&tiles.some(tile=>!loaded[tile.key])&&<View pointerEvents="none" style={{position:'absolute',top:8,left:8,backgroundColor:C.white,padding:8,borderRadius:10}}><Text accessibilityLiveRegion="polite" style={s.caption}>지도를 불러오는 중이에요</Text></View>}
    <Pressable accessibilityRole="link" onPress={()=>{void Linking.openURL('https://www.openstreetmap.org/copyright').catch(()=>setFailed(true));}} style={{position:'absolute',bottom:0,right:0,backgroundColor:C.white,padding:8,minHeight:44,justifyContent:'center'}}><Text style={{fontSize:12,color:C.ink}}>© OpenStreetMap contributors</Text></Pressable>
  </View>
  {failed&&<Text accessibilityLiveRegion="polite" style={s.caption}>지도 배경을 불러오지 못했어요. 목록과 카카오맵 상세를 이용해 주세요.</Text>}
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{[['확대',()=>changeZoom(1)],['축소',()=>changeZoom(-1)],['← 왼쪽',()=>move(-128,0)],['↑ 위쪽',()=>move(0,-128)],['↓ 아래쪽',()=>move(0,128)],['→ 오른쪽',()=>move(128,0)],['전체 보기',()=>setView(fitPlaces(places,width,height))]].map(([label,action])=><Pressable key={String(label)} accessibilityRole="button" accessibilityLabel={String(label)} onPress={action as ()=>void} style={{minHeight:56,minWidth:56,paddingHorizontal:12,justifyContent:'center',alignItems:'center',borderRadius:12,backgroundColor:C.pale}}><Text style={s.link}>{String(label)}</Text></Pressable>)}</View></>;
}
