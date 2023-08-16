import common from "./common";

// 수정된 피쳐 정보 리스트 편집 관련 function
const saveList = {

	setInsertEdit : (map, curLyrName, modifiedFeature) => {
		const edited = [];
		
		edited.push({ 
			type : 'insert',
			source : common.getCurrentLayer(map, curLyrName).getSource(), 
			feature : modifiedFeature,
			layerName : common.getCurrentLayer(map, curLyrName).get('layerName')
		});

		return edited
	},

  setUpdateEdit : (map, curLyrName, modifiedFeature, beforeFeature) => {
    
    const edited = [];

    edited.push({
      type: 'update',
      feature: modifiedFeature, 
			oldFeature: beforeFeature, 
			layerName: common.getCurrentLayer(map, curLyrName).get('layerName'), 
    });

    return edited
  },

	setDeleteEdit : (map, curLyrName, features) => {
		const edited = [];

		for (let item of features) {
			edited.push({ 
				type: 'delete', 
				source: common.getCurrentLayer(map, curLyrName).getSource(),
				feature: item, 
				layerName: common.getCurrentLayer(map, curLyrName).get('layerName')
			});
		}

		return edited;
	},

  /** setEditedFeatures // save edited List when unredoList is changed */
	setSaveFeatures : (unredoList, setEditedFeatures) => {
		const saveList = [];

		for(let i=0; i<unredoList.length; i++ ){
			for(let j=0; j<unredoList[i].length; j++){
				let isCompleted = false;

				switch (unredoList[i][j].type){
					case ('insert') :
						saveList.push(unredoList[i][j]);
						break;
					case ('update') :
						for(let k=0; k<saveList.length; k++){ 
							// saveList[k] =  최종적으로 보내야 할 saveList 단일요청
							// unredoList[i][j] = 중복되는 요청 있을 수 있기에 수정해서 담아야 한다

							// 1. 기존 있던 feature를 수정한 경우, update로 남아 있어야 한다. 이 경우, unredoList의 feature를 계속해서 갱신하면 된다
							if(saveList[k].type === 'update' && saveList[k].feature.getId() === unredoList[i][j].feature.getId()){
								saveList[k].feature = unredoList[i][j].feature;

							// 2. 새로 추가한 피쳐를  업데이트 한다면 update 요청이 아닌 insert 요청으로 save해야 하기에 update가 push되서는 안된다
							} else if (saveList[k].type === 'insert' && saveList[k].feature === unredoList[i][j].feature) {
								saveList[k].feature = unredoList[i][j].feature;
								isCompleted = true;
								break;
							}
						}
						if(!isCompleted){
							saveList.push(unredoList[i][j]);
						}
						break;
					case ('delete') : 
						for(let k=0; k<saveList.length; k++){
							// insert된 요소가 삭제된다면 saveList에서 배제
							if(saveList[k].type === 'insert' && saveList[k].feature.getId() === unredoList[i][j].feature.getId()){
								saveList.splice(k, 1);
								isCompleted = true;
								break;
							} else if(saveList[k].type !== 'insert' && saveList[k].feature.getId() === unredoList[i][j].feature.getId()){
								saveList[k] = unredoList[i][j];
								isCompleted = true;
								break;
							}
						}
						if(!isCompleted){
							saveList.push(unredoList[i][j]);
						}
						break;
					default : break;
				}
			}
		}

		setEditedFeatures(saveList);
	}
}

export default saveList;