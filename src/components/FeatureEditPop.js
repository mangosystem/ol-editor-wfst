import { Modify, Snap } from "ol/interaction";

import common from "../function/common";
import editor from "../function/editor";
import saveList from "../function/saveList";

export default function FeatureEditPop (props){

  const {
    map,
    select,
    curLyrName,
    editToolOpen, 
    popupTop, 
    popupLeft, 

    addUndoList,
    setFeatureInfo, 
    handleClosePopup,
    handleAddSnap,
    modifyEndCallback,
  } = props.value; 

  const handleFeatureMove = () => {
		handleClosePopup();
		editor.featureMove(map, curLyrName, addUndoList);
	};

	const handleFeatureRotate = (features) => {
		handleClosePopup();

    const createRotateStyle = () => {
      let styles = {
        anchor: [],
        arrow: []
      }
      return function (feature, resolution) {
        let style;
        let angle = feature.get('angle') || 0;
        switch (true) {
          case feature.get('rotate-anchor'):
            style = styles['anchor'];
            return style
          case feature.get('rotate-arrow'):
            style = styles['arrow'];
            return style;
          default : break;
        }
      }
    }

		editor.rotate(map, features, createRotateStyle(), curLyrName, addUndoList);
	};

	const handleFeatureStraight = (features) => {
		handleClosePopup();
		for (let item of features) {
			editor.lineStraight( map, item, curLyrName, addUndoList);
		}
	};

	const handleFeatureReverse = (features) => {
		handleClosePopup();
		for (let item of features) {
			editor.lineReverse( map, item, curLyrName, addUndoList);
		}
	};

	const handleFeatureSimplify = (features) => {
		handleClosePopup();
		for (let item of features) {
			editor.simplify( map, item, curLyrName, addUndoList);
		}
	};

	const handleFeatureReflect = (type, features) => {
		handleClosePopup();
		for (let item of features) {
			editor.reflect(type, map, item, curLyrName, addUndoList);
		}
	};

	const handleFeatureSplit = (type, feature) => {
		handleClosePopup();
		
    if(type.indexOf('Point') !== -1){
      editor.pointSplit(map, feature, curLyrName, addUndoList)
    } else if (type.indexOf('LineString') !== -1) {
			editor.lineSplit(map, feature, curLyrName, addUndoList, select);
		} else if (type.indexOf('Polygon') !== -1) {
			editor.polygonSplit(map, feature, curLyrName, addUndoList ,select);
		} 
	};

  const handleFeatureDrawSplit = (type, feature) => {
		handleClosePopup();
		
    if (type.indexOf('LineString') !== -1) {
			editor.lineDrawSplit(map, feature, curLyrName, addUndoList, select);
		} else if (type.indexOf('Polygon') !== -1) {
			editor.polygonDrawSplit(map, feature, curLyrName, addUndoList, select);
		}
	};

	const handleFeatureMerge = (type, features) => {
		handleClosePopup();
		if (type.indexOf('Point') !== -1) {
      // 병합
			// editor.pointMerge(map, curLyrName, features, addUndoList); 
			
      // 중심점 구하기
      editor.midPointAdd(map, curLyrName, features, addUndoList);
		} else if (type.indexOf('LineString') !== -1) {
			editor.lineStringMerge(map, features, curLyrName, addUndoList);
		} else if (type.indexOf('Polygon') !== -1) {
			editor.polygonMerge(map, curLyrName, addUndoList, features);
		}
	};

	const handleFeatureNodeSplit = (features) => {
		handleClosePopup();
		editor.lineNodeSplit(map, curLyrName, addUndoList, features);
	};

	const handleDelete = (features) => {

		handleClosePopup();
		setFeatureInfo({});

		const edited = saveList.setDeleteEdit(map, curLyrName, features);
		addUndoList(edited);
    
		for (let item of features) {
			const source = common.getCurrentLayer(map, curLyrName).getSource();
      if(!source.getFeatures().includes(item)){
        source.addFeature(item);
      }
      source.removeFeature(item);
		}
	};

	const handleFeatureEdit = (features) => {
		handleClosePopup();
		
		const modify = new Modify({ features });
		// setModify(modify);
		map.addInteraction(modify);

		let beforeFeature;

		modify.on('modifystart', (e) => {
			map.getInteractions().forEach(function (interaction) {
				if(interaction instanceof Snap){
					// interaction.removeFeature(e.features.getArray()[0]);
					beforeFeature = e.features.getArray()[0].clone();
				}
			})
		}); 
		
		modify.on('modifyend', (e) => modifyEndCallback(e, beforeFeature));

		handleAddSnap(map, curLyrName);
	};

  return(
    <ul
    className="contextMenuIcon"
    style={{ display: editToolOpen ? 'block' : 'none', top: popupTop, left: popupLeft }}
    >
      {
        // 라인일 때 편집
        common.isLineSelect(select) ?
          <>
            <li onClick={() => handleFeatureStraight(select.getFeatures().getArray())}>
              직선화
            </li>
            <li onClick={() => handleFeatureReverse(select.getFeatures().getArray())}>
              방향반전
            </li>
            <li onClick={() => handleFeatureNodeSplit(select.getFeatures().getArray())}>
              노드별 분할
            </li>
          </>
        : null}
      {
        // 폴리곤, 라인일 때 편집 기능
        common.isPolygonOrLineSelect(select) ?
          <>
            <li onClick={() => handleFeatureSimplify(select.getFeatures().getArray())}>
              단순화
            </li>
            <li onClick={() => handleFeatureReflect('short', select.getFeatures().getArray())}>
              짧은축 반전
            </li>
            <li onClick={() => handleFeatureReflect('long', select.getFeatures().getArray())}>
              긴축 반전
            </li>
            <li onClick={handleFeatureMove}>
              이동
            </li>
          </>
        : null}
      {
        common.isOnePolygonOrLineSelect(select) ?
          <li onClick={() => handleFeatureRotate(select.getFeatures().getArray())}>
            회전
          </li>
        : null}
      { common.isOnePolygonOrLineSelect(select) 
        && select.getFeatures().getArray()[0].getGeometry().getCoordinates().length === 1 ?
        <li onClick={() => handleFeatureDrawSplit(select.getFeatures().getArray()[0].getGeometry().getType(), select.getFeatures().getArray()[0])}>
          선으로 분할
        </li>
      : null}
      {
        common.isOnePolygonOrLineSelect(select)
          && select.getFeatures().getArray()[0].getGeometry().getCoordinates().length > 1 ?
            <li onClick={() => handleFeatureSplit(select.getFeatures().getArray()[0].getGeometry().getType(), select.getFeatures().getArray()[0])}>
              분할
            </li>
          : null}
      {/* // 2개 이상의 피쳐(같은 geometry type) 일 때 편집  */}
      <>
        { 
          select !== null
            && select.getFeatures().getArray().length > 1
            ?
            <li onClick={() => handleFeatureMerge(select.getFeatures().getArray()[0].getGeometry().getType(), select.getFeatures().getArray())}>
              병합
            </li>
            // 공통
            : null}
      </>
      {
        select !== null
          && select.getFeatures().getArray().length === 1 ?
          <li onClick={() => handleFeatureEdit(select.getFeatures())}>
            수정
          </li>
      : null}
      <li onClick={() => handleDelete(select.getFeatures().getArray())}>
        삭제
      </li>
    </ul>
  )
}