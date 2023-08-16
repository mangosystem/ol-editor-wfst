import {getUid} from 'ol/util';

// value check & get value
const common = {

  isCheckLayer : (curLyrName) => {
		if( !curLyrName ){
			alert('레이어를 먼저 선택해주세요.')
			return false;
		}
		return true;
	},

  hasUndoList : (undoList, checkRedo, redoList) => {
		if( !undoList || !undoList.length ){
			alert('변경사항이 없습니다.')

			if(checkRedo && !redoList && !redoList.length){
				return true;
			}
			return false;
		}
		return true;
	},

	hasEditedFeatures : (editedFeatures) => {
		if( !editedFeatures || !editedFeatures.length ){
			alert('저장할 변경사항이 없습니다.');
			return false;
		}
		return true;
	},

  hasRedoListValue : (redoList) => {
		if( !redoList || !redoList.length ){
			alert('되돌릴 변경사항이 없습니다.');
			return false;
		}
		return true;
	},

  hasUndoListValue : (map, curLyrName, undoList) => {
    
    const undo = common.getCurLyrUndoList(map, curLyrName, undoList);
		if( !undo || undo.length === 0 ){
			alert('변경사항이 없습니다.')
			return false;
		}
		return true;
	},

  getCurrentLayer : (map, curLyrName) => {
		return map.getLayers().getArray()
      .filter(layer => layer.get('name') === curLyrName)[0];
	},

  getCurLyrUndoList : (map, curLyrType, undoList) => {
		const curLyrUndoList = [];

		for(let i=0; i<undoList.length; i++){
			for(let j=0; j<undoList[i].length; j++){
				
        const curLyrNM = common.getCurrentLayer(map, curLyrType).get('layerName');

        if(undoList[i][j].layerName === curLyrNM){
          curLyrUndoList.push(undoList[i]);
				}
			}
		}
		return curLyrUndoList;
	},

  getSelectedFeature : (select) => {
		return select.getFeatures().getArray()[0]
	},

	getFeatureProp : (curLyr, feature) => {
		// feature property setting when draw end  
		const featureCopy = feature;

		const uid = getUid(featureCopy)
		const tempId = curLyr.get('layerName').concat("." + uid);
		featureCopy.setId(tempId);

		const curLyrFeaturesProp = curLyr.getSource()
			.getFeatures()[0].clone().getProperties();
			
		const copiedProp = {};

		for (const key of Object.keys(curLyrFeaturesProp)) {
			if (key === 'input_date') {
				const date = new Date();
				const defaultDate = date.getFullYear() + '-' 
					+ ("0" + (date.getMonth() + 1)).slice(-2) + '-' + ('0' + (date.getDate())).slice(-2); 

				copiedProp[key] = defaultDate;
			} else if(key === 'student_id'){
				copiedProp[key] = 0;
			} else if(key !== 'geom' && key !== 'geometry'){
				copiedProp[key] = "";
			} 
		} 

		return copiedProp
	},

	// 새로운 feature Prop 이 아닌 id를 제외한 feature들을 복사해오기
	getClonedFeatureProp : (curLyr, beforeFeature, modifiedFeature) => {
		// feature property setting when draw end  

		const uid = getUid(modifiedFeature)
		const tempId = curLyr.get('layerName').concat("." + uid);
		modifiedFeature.setId(tempId);

		curLyr.getSource().getFeatures()[0].getId();
		const curLyrFeaturesProp = beforeFeature.getProperties();
		const copiedProp = {};
		
		for (const [key, value] of Object.entries(curLyrFeaturesProp)) {
			if(key.includes('id')){
				copiedProp[key] = 0;
			} else if(key !== 'geom' && key !== 'geometry') {
				copiedProp[key] = value;
			} 
		} 

		return copiedProp
	},

	// feature Edit Pop condition
	isPolygonOrLineSelect : (select) => {	
		if(
			select !== null && 
			select.getFeatures().getArray().length > 0 
		){
			if(
				select.getFeatures().getArray()[0].getGeometry().getType().indexOf('LineString') !== -1 ||
				select.getFeatures().getArray()[0].getGeometry().getType().indexOf('Polygon') !== -1 
			){
				return true;
			}
		} 
		
		return false;
	},

	isLineSelect : (select) => {	
		if(
			select !== null && 
			select.getFeatures().getArray().length > 0 && 
			select.getFeatures().getArray()[0].getGeometry().getType().indexOf('LineString') !== -1
		) return true;
		
		return false;
	},

	isOnePolygonOrLineSelect : (select) => {
		if(
			select !== null
      && select.getFeatures().getArray().length === 1
      && select.getFeatures().getArray()[0].getGeometry().getType().indexOf('Point') === -1
		) return true;
		
		return false;
	},
}

export default common;