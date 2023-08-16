import { useEffect, useRef, useState } from "react";

import { Map, View } from "ol";
import { LineString, Point } from "ol/geom";
import { transform } from "ol/proj";
import { WFS, GeoJSON, GML } from 'ol/format';
import { OSM, Vector as VectorSource } from "ol/source";
import { Tile as TileLayer, Vector as VectorLayer } from "ol/layer";
import { Draw, Modify, Select, Snap, Translate, defaults } from "ol/interaction";
import { Circle, Fill, Icon, Stroke, Style } from "ol/style";
import RotateFeatureInteraction from 'ol-rotate-feature';

import axios from "axios";

import Alert from "./../../Alert";
import arrow2 from '../../../assets/img/mapIcon/arrow2.png';
import { Button, Select as SelectUI, InputLabel, FormControl, MenuItem, makeStyles, Box } from '@material-ui/core';

import LineSegment from "jsts/org/locationtech/jts/geom/LineSegment";
import { GeoJSONReader } from "jsts/org/locationtech/jts/io";

import dom2str from 'dom-to-string';
import parseXML from 'xml-parse-from-string';

import saveList from "../../../function/saveList";
import common from "../../../function/common";
import FeatureEditPop from "../../FeatureEditPop";
import './main.css'
import moment from "moment/moment";

export default function Main() {

  const [map, setMap] = useState(null);
	
	const [curLyrName, setCurLyrName] = useState("");
  // const [multi, setMulti] = useState(null); // multi type select ui
  
	const [anchorEl, setAnchorEl] = useState(null);
  const [popupTop, setPopupTop] = useState(null);
  const [popupLeft, setPopupLeft] = useState(null);
	const [alertOpen, setAlertOpen] = useState(false);
	
  // const [draw, setDraw] = useState(null); 
  const [select, setSelect] = useState(null);
  // const [modify, setModify] = useState(null);

	const [undoList, setUndoList] = useState([]);
  const [redoList, setRedoList] = useState([]);
	
	const [editedFeatures, setEditedFeatures] = useState([]) 
	const [featureInfo, setFeatureInfo] = useState({});

	const inputRef = useRef(null);

	const { setUpdateEdit, setSaveFeatures } = saveList;

  useEffect(() => {

    const initialDrawLyr = new VectorLayer({
			name: 'drawLyr',
			source: new VectorSource({
				wrapX: false
			}),
			visible: false,
			style: feature => setDrawLineStyle(feature, map),
		});

    const vectorSource = (typeName) => {
      const source = new VectorSource({
        format : new GeoJSON(),
        loader : function(extent, resolution, projection){
          // const proj = projection.getCode();
          axios({
              url:process.env.REACT_APP_DEFAULT_MAP_URL+"wfs",
              method:'GET',
              params: {
                'service':'WFS','version':'1.1.0','request':'GetFeature',
                'typeName':typeName,'outputFormat':'application/json'
              }
            }).then((res)=>{
              if(res.status === 200){
                let addFeatures = source.getFormat().readFeatures(res.data);
                source.addFeatures(addFeatures);
              } else {
                console.log("통신 에러")
              }
            }).catch((err)=>{
              console.log(err);
            });
        },
      });
      return source
    };

    const pointLyr = new VectorLayer({
      name : "Point", 
      source : vectorSource('mango:danger_loc'),
			visible : false,
			style : feature => setDrawLineStyle(feature, map),
			layerName : 'danger_loc',
    });

    const lineLyr = new VectorLayer({
      name : "LineString", 
      source : vectorSource('mango:school_walkway'),
			visible : false,
			style : feature => setDrawLineStyle(feature, map),
			layerName : 'school_walkway',
    });

    const polygonLyr = new VectorLayer({
      name : "Polygon",
      source : vectorSource('mango:danger_zone'),
			visible : false,
			style : feature => setDrawLineStyle(feature, map),
			layerName : 'danger_zone',
    })

    const layers = [
      new TileLayer({ source: new OSM() }),
      // initialDrawLyr,
      pointLyr,
			lineLyr,
      polygonLyr
    ];

    const initialMap = new Map({
			target: 'map',
			layers: layers,
			view: new View({
				center: transform([process.env.REACT_APP_DEFAULT_MAP_CENTER_LON, process.env.REACT_APP_DEFAULT_MAP_CENTER_LAT], 'EPSG:4326', 'EPSG:3857'),
				zoom: process.env.REACT_APP_DEFAULT_MAP_ZOOM_LEVEL,
				minZoom: 8,
				maxZoom: 22,
				projection: 'EPSG:3857',
				interactions: defaults({})
			}),
			controls : defaults({ attribution:false, zoom:false, rotate:false })
		});

		const initialSelect = new Select();

		// addInteraction
    initialMap.addInteraction(initialSelect);
		initialSelect.on('select', selectFunc);
		initialMap.getViewport()
			.addEventListener('contextmenu', (e) => rightClick(e, initialMap, initialSelect));
		initialMap.on('click', () => {
			handleClosePopup();
			initialMap.getInteractions().forEach(function (interaction) {
				// 피쳐 이동 interaction 삭제
				if (interaction instanceof Translate) {
					initialMap.removeInteraction(interaction);
				} else if (interaction instanceof RotateFeatureInteraction) { // 피쳐 회전 interaction 삭제
					initialMap.removeInteraction(interaction);
				} else if(interaction instanceof Modify) { // 피쳐 수정 interaction 삭제
					initialMap.removeInteraction(interaction);
				}
			});
		});

    setMap(initialMap);
    setSelect(initialSelect);
  },[])

	//** feature control function start */
  const	selectFunc = (e) => {
		// debugger
		if (e.target.getFeatures().getArray().length > 0) {
			let type = null;
			
			for (let i = 0; i < e.target.getFeatures().getArray().length; i++) {
				const feature = e.target.getFeatures().getArray()[i];
				setFeatureInfo(feature.getProperties());

				if (type === null) {
					type = feature.getGeometry().getType();
				} else if (type !== feature.getGeometry().getType()) {
					e.target.restorePreviousStyle_(e.target.getFeatures().getArray()[i]);
					e.target.getFeatures().getArray().splice(i, 1);
					e.selected.splice(0, 1);
					alert('같은 타입의 피쳐만 선택할 수 있습니다.');
					return;
				}
			}
		} else {
			setFeatureInfo({});
		}
	}

	const drawFunc = (type) => {

		map.getInteractions().forEach(function (interaction) {
			if (interaction instanceof Draw) {
				map.removeInteraction(interaction);
			}
		})

		if (type) {

			map.removeInteraction(select);
			const draw = new Draw({
				source: common.getCurrentLayer(map, curLyrName).getSource(),
				geometryName: 'geom',
				type: type
			});

			draw.on('drawend', (e) => drawEndCallback(e, draw))

			map.addInteraction(draw);
			handleAddSnap(map, curLyrName);
		}
	}

	const setDrawLineStyle = (feature, map) => {
		let geometry = feature.getGeometry();
		//let properties = feature.getProperties();
		let styles;
		if (geometry.getType().indexOf('Point') !== -1) {
			styles = new Style({
				//point
				image: new Circle({
					radius: 8,
					fill: new Fill({
						color: 'rgba(20, 20, 255, 0.5)'
					}),
					stroke: new Stroke({
						color: 'rgba(20, 20, 255, 1)',
						width: 2
					})
				}),
			})
		} else if (geometry.getType().indexOf('LineString') !== -1) {
			styles = [
				// linestring
				new Style({
					stroke: new Stroke({
						color: 'rgba(255, 196, 20, 1)',
						width: 5
					}),
					fill: new Fill({
						color: 'rgba(255, 196, 20, 0.1)'
					})
				})
			];
		} else {
			styles = [
				// polygon
				new Style({
					stroke: new Stroke({
						color: 'rgba(255, 255, 255, 1)',
						width: 5
					}),
					fill: new Fill({
						color: 'rgba(255, 255, 255, 0.1)'
					})
				})
			];
		}

		// MultiLineString 스타일(화살표)
		if (geometry.getType().indexOf('MultiLineString') !== -1) {
			geometry.getCoordinates().forEach(function (coord) {
				for (let i = 0; i < coord.length - 1; i++) {
					const dx = coord[i + 1][0] - coord[i][0];
					const dy = coord[i + 1][1] - coord[i][1];
					let rotation = Math.atan2(dy, dx);

					const reader = new GeoJSONReader();
					const point1 = reader.read({ type: 'Point', coordinates: coord[i] });
					const point2 = reader.read({ type: 'Point', coordinates: coord[i + 1]});

					let midpoint = new LineSegment(point1.getCoordinates()[0], point2.getCoordinates()[0]).midPoint();
					styles.push(new Style({
						geometry: new Point([midpoint.x, midpoint.y]),
						image: new Icon({
							src: arrow2,
							anchor: [0.75, 0.5],
							rotateWithView: true,
							rotation: -rotation
						})
					}));
				}
			});
			// LineString 스타일(화살표)
		} else if (geometry.getType().indexOf('LineString') !== -1) {
			geometry.forEachSegment(function (start, end) {
				var dx = end[0] - start[0];
				var dy = end[1] - start[1];
				var rotation = Math.atan2(dy, dx);
				// arrows
				const reader = new GeoJSONReader();
				const point1 = reader.read({ type: 'Point', coordinates: start });
				const point2 = reader.read({ type: 'Point', coordinates: end });
				let midpoint = new LineSegment(point1.getCoordinates()[0], point2.getCoordinates()[0]).midPoint();

				styles.push(new Style({
					geometry: new Point([midpoint.x, midpoint.y]),
					image: new Icon({
						src: arrow2,
						anchor: [0.75, 0.5],
						rotateWithView: true,
						rotation: -rotation
					})
				}));
			});
		}

		return styles;
	}

	//** feature function end */

	//** top ui event start */
  const editToolOpen = Boolean(anchorEl);

	const changeLayer = (val) => {

		clearInteractions();

		map.getLayers().getArray().forEach((item) => {
			if(item.get('name') === val){
				item.setVisible(true);
				setCurLyrName(val);
			} else if(item.get('name')){
				item.setVisible(false);
			}
		});
		setFeatureInfo({});
	}

	const rightClick = (e, map, select) => {
		e.preventDefault();

		let clickEvent = map.forEachFeatureAtPixel(map.getEventPixel(e),
			function (feature, layer) {
				return { feature, layer };
		});

		map.getInteractions().forEach(function (interaction) {
			if (interaction instanceof Modify) {
				alert('수정 종료후 다시 시도');
				clickEvent = null;
			}
		});

		if (clickEvent && clickEvent.layer !== null) {
			const feature = clickEvent.feature;
			let vectorLayer = clickEvent.layer;
			let popupTop = null;
			let popupLeft = null;

			if (select && select.getFeatures().getArray().length > 1) {

			} else if (select) {
				select.getFeatures().clear();
				select.getFeatures().push(feature); //select에 넣어주기
			}


			//오른쪽 버튼 popup open 및 위치
			const anchorEl = e.currentTarget;
			if (feature.getGeometry().getType().indexOf('Polygon') !== -1) {
				popupTop = e.clientY - 70;
			} else {
				popupTop = e.clientY - 70;
			}
			popupLeft = e.clientX;

      setAnchorEl(anchorEl);
      setPopupTop(popupTop);
      setPopupLeft(popupLeft);
		}
	}

	const handleUndoBtn = () => {
		console.log(undoList)
		if(common.isCheckLayer(curLyrName) && common.hasUndoListValue(map, curLyrName, undoList)){
			clearInteractions();
			const curLyrUndoList = common.getCurLyrUndoList(map, curLyrName, undoList);
			const curLyrUndo = curLyrUndoList[curLyrUndoList.length - 1];
			setRedoList([...redoList, curLyrUndo]);

			executeUndoRedo(curLyrUndo, "UNDO");

			setUndoList(undoList => undoList.filter((edit) => edit !== curLyrUndo));
			setSaveFeatures(undoList, setEditedFeatures);
		} 
	}

	const handleRedoBtn = () => {
		if(common.isCheckLayer(curLyrName) && common.hasRedoListValue(redoList)){
			clearInteractions();

			setUndoList(undoList => [...undoList, redoList[redoList.length - 1]])

			executeUndoRedo(redoList[redoList.length - 1], "REDO");

			setRedoList(redoList => redoList.slice(0, redoList.length - 1));
			setSaveFeatures(redoList, setEditedFeatures);
		}
	}

	const handleAddBtn = () => {
		if(common.isCheckLayer(curLyrName)){
			let vectorTypeNm = curLyrName;
			if(curLyrName === "Point") {
				drawFunc(vectorTypeNm);
			} else {
				vectorTypeNm = 'Multi'.concat(vectorTypeNm);
				drawFunc(vectorTypeNm);
			}

			// if(multi !== null){
			// 	if(multi){
			// 		vectorTypeNm = 'Multi'.concat(vectorTypeNm);
			// 	}
			// 	drawFunc(vectorTypeNm);
			// }
		}
	}
	
	const handleRefreshBtn = () => {
		if(common.isCheckLayer(curLyrName) && common.hasUndoListValue(map, curLyrName, undoList)){
			clearDataAndLayer()
		}
	}
	
	const handleSaveBtn = () => {

		if(common.isCheckLayer(curLyrName) && common.hasEditedFeatures(editedFeatures) && common.hasUndoList(undoList, true, redoList)){	
			let convertWfstXml = null;
			const layerNames = []; 
			
			for(let item of editedFeatures){
				if(!layerNames.includes(item.layerName)){
					layerNames.push(item.layerName)
				}
			}
			
			for(let i = 0; i < layerNames.length; i++ ){
			 const edited	= editedFeatures.filter((item) => item.layerName === layerNames[i]);

			 for(let item of edited){

				 let createWfstXml = createTransactWFS(item.type, item.feature, item.layerName);		
				 let typeWfstXml = parseXML(createWfstXml);
				 
				 if(convertWfstXml === null){
					 convertWfstXml = typeWfstXml;
				 } else {
					 let selectWfstXml = null;
					 if(item.type === 'delete'){
						 selectWfstXml = typeWfstXml.getElementsByTagName('Delete')[0];
					 } else {
						 if(item.type === 'insert'){
							 selectWfstXml = typeWfstXml.getElementsByTagName('Insert')[0];
						 } else {
							 selectWfstXml = typeWfstXml.getElementsByTagName('Update')[0];
						 }
					 } 
					 convertWfstXml.children[0].append(selectWfstXml);
				 }
			 }
			}

			let requestWfstXml = dom2str(convertWfstXml.children[0]);

			const url = process.env.REACT_APP_DEFAULT_MAP_URL 
				+ "wfs?dataType=xml&processData=false&contentType=text/xml&version=1.1.0&request=transaction";
			
			const form = new FormData();
			form.append('body', requestWfstXml);

			axios.post(
				url,
				requestWfstXml,
				{headers:
					{'Content-Type': 'text/xml'},
				}).then((res) => {
					clearDataAndLayer();
			}).catch((err) => {
				console.log(err);
			})
		}
	}

	//** ui event end */

	//** edit pop handler start*/
	
	const handleClosePopup = () => {
    setAnchorEl(null);
	};

	const handleAddSnap = (map, curLyrName) => {
		if(map){
			map.getInteractions().getArray().forEach(function (interaction) {
				if(interaction instanceof Snap) {
					map.removeInteraction(interaction);
				}
			})
	
			const snap = new Snap({
				source: common.getCurrentLayer(map, curLyrName).getSource()
			})
	
			map.addInteraction(snap);
		}
	};
	
	//** edit pop handler end*/


	//**saveList function start */ 

	const refreshLayer = () => {
		map.getLayers().getArray().forEach((layer) => layer.getSource().refresh())
	}

	const clearDataAndLayer = () => {
		setUndoList([]);
		setRedoList([]);
		setEditedFeatures([]);
		setFeatureInfo({});
		refreshLayer();
		clearInteractions();
	}

	const clearInteractions = () => {
		handleClosePopup();
		map.getInteractions().forEach(function (interaction) { // 피쳐 이동 interaction 삭제
			if (interaction instanceof Translate) {
				map.removeInteraction(interaction);
			} else if (interaction instanceof RotateFeatureInteraction) { // 피쳐 회전 interaction 삭제
				map.removeInteraction(interaction);
			} else if(interaction instanceof Modify) { // 피쳐 수정 interaction 삭제
				map.removeInteraction(interaction);
			} else if(interaction instanceof Draw) { 
				map.removeInteraction(interaction);
			}
		});
	}
	
	const modifyEndCallback = (e, beforeFeature) => {
		/** type - interaction, source, feature, layerNm  */
		const modifiedFeature = e.features.getArray()[0];
		const edit = setUpdateEdit(map, curLyrName, modifiedFeature, beforeFeature);
		addUndoList(edit);
	} 

	const drawEndCallback = (e, draw) => {
		map.removeInteraction(draw);
		select.getFeatures().push(e.feature);
		map.addInteraction(select);

		const feature = e.feature;
		const curLyr = common.getCurrentLayer(map, curLyrName);

		const featureProp = common.getFeatureProp(curLyr, feature);
		feature.setProperties(featureProp);
		setFeatureInfo(feature.getProperties());

		const edited = saveList.setInsertEdit(map, curLyrName, feature);
		addUndoList(edited);
	}

	const executeUndoRedo = (e, task) => {
		const undo = task === "UNDO" ? true : task === "REDO" ? false : alert('task error');

		for(let i = 0; i < e.length; i++){
			switch (e[i].type) {
				case ('insert') :
					if(undo){
						const featureExists = e[i].source.getFeatureById(e[i].feature.getId());
				    if (featureExists) {
				      e[i].source.removeFeature(e[i].feature);
				    }
					} else  e[i].source.addFeature(e[i].feature);
					break;
				case ('update') :
          if(e[i].oldFeature){

						const geom = e[i].feature.getGeometry(); 
						const properties = e[i].feature.getProperties();
						
						e[i].feature.setGeometry(e[i].oldFeature.getGeometry());
						e[i].feature.setProperties(e[i].oldFeature.getProperties());

						e[i].oldFeature.setGeometry(geom);
						e[i].oldFeature.setProperties(properties);

            if(common.getSelectedFeature(select) === e[i].feature){
              setFeatureInfo(e[i].feature.getProperties());
            }
          }
					break;
				case ('delete') : 
					if('delete'){
						if(undo){ 
							e[i].source.addFeature(e[i].feature); 
							setFeatureInfo(e[i].feature.getProperties());
						} else { 
							e[i].source.removeFeature(e[i].feature);
							setFeatureInfo({});
						}
					}
					break;
				default : break;
			}

		}
	}

	const insertFeatureData = (key, value) => {
		const feature = common.getSelectedFeature(select);

		if(key === "input_date"){
			const dateValue = new Date(value);
			feature.setProperties({ [key] : dateValue });
		} else {
			feature.setProperties({ [key] : value });
		}

		setFeatureInfo(feature.getProperties(value))
	}

	/** mode - insert, update, delete  */
	const createTransactWFS = (mode, feature, layerName) => {
		const formatWFS = new WFS();

		let formatGML = new GML({
			featureNS : 'www.mangosystem.com',
			featureType : layerName,
			srsName: 'EPSG:3857'
		});

		let payload = null;

		switch (mode) {
			case 'insert' :
				payload = new XMLSerializer().serializeToString(
					formatWFS.writeTransaction([feature], null, null, formatGML)
				);
				if(payload.indexOf('geometry') !== -1){
					payload = payload.replace(/geometry/gi, 'geom');
				}
				break;
			case 'update' :
				payload = new XMLSerializer().serializeToString(
					formatWFS.writeTransaction(null, [feature], null, formatGML)
				);
				if(payload.indexOf('geometry') !== -1){
					payload = payload.replace(/geometry/gi, 'geom');
				}
				break;
			case 'delete':
				payload = new XMLSerializer().serializeToString( 
					formatWFS.writeTransaction(null, null, [feature], formatGML)
				);
				if(payload.indexOf('geometry') !== -1){
					payload = payload.replace(/geometry/gi, 'geom');
				}
				break;
			default : break;
		}
		return payload;
	} // serialize를 하는 이유는 dom 구조에서 append로 모든 wfsT 요청 트리를 이어 붙이기 위해

	const addUndoList = (edit) => {
		const undo = undoList;
		undo.push(edit);
		setUndoList(undo);
		setSaveFeatures(undoList, setEditedFeatures);
		setRedoList([]);
	}

	const focusInInfo  = () => {
		if(!inputRef.current){
			inputRef.current = common.getSelectedFeature(select).clone();
		}
	}

	const focusOutInfo = (propNm, modifiedVal) => {

		const feature = common.getSelectedFeature(select);
		const beforeFeature = inputRef.current;

		if(beforeFeature.get(propNm) !== modifiedVal){
			feature.set(propNm, modifiedVal);
			
			beforeFeature.setId(feature.getId());
			const edited = saveList.setUpdateEdit(map, curLyrName, feature, beforeFeature);
			addUndoList(edited);

			inputRef.current = null;
		}
	}
	//**saveList function end */ 

	const useStyles = makeStyles((theme) => ({
		formControl: {
			margin: theme.spacing(1),
			minWidth: 120,
		},
	}));

	// util
	const checkUtcTime = (time) => {
		if(typeof(time) === 'string' && time.includes('Z')){
			const d = new Date(time.slice(0, time.length -1));
			d.setDate(d.getDate() + 1);
			return d;
		}
		return time 
	}

	return (
		<>
			<div id="map" style={{ width: "100%", height: "100%" }} />
			<div style={{ position: 'absolute', top: 20, left: '39.5%', backgroundColor: 'rgba(158, 148, 152, 0.72)', width: '25%' }}>
				<div>
					<FormControl className={useStyles().formControl}>
						<InputLabel id="demo-simple-select-label">{curLyrName? "current Layer" : "Select Layer"}</InputLabel>
						<SelectUI
							labelId="demo-simple-select-label"
							id="demo-simple-select"
							value={curLyrName || ""}
							onChange={(e) => changeLayer(e.target.value)}
						>
							{["Point", "LineString", "Polygon"].map((val, idx) => <MenuItem key={idx} value={val}>{val}</MenuItem>)}
						</SelectUI>
					</FormControl>
					{/** multi select ui demo
					<FormControl className={useStyles().formControl}>
						<InputLabel htmlFor="age-native-simple">{multi? "Current Type" : "Select Type"}</InputLabel>
						<SelectUI
							labelId="demo-simple-select-label"
							id="demo-simple-select"
							value={multi !== null ? multi : ""}
							onChange={(e) => setMulti(e.target.value)}
						>
							<MenuItem value={false}>single</MenuItem>
							<MenuItem value={true}>multi</MenuItem>
						</SelectUI>
					</FormControl>	 
				*/}
				</div>
				<div>
					<Button variant="contained" color="primary" style={{ margin: 5 }} onClick={() => handleRefreshBtn()}>ref</Button>
					<Button variant="contained" color="primary" style={{ margin: 5 }} onClick={() => handleUndoBtn()}>undo</Button>
					<Button variant="contained" color="primary" style={{ margin: 5 }} onClick={() => handleRedoBtn()}>redo</Button>
					<Button variant="contained" color="primary" style={{ margin: 5 }} onClick={() => handleAddBtn()}>add</Button>
					<Button variant="contained" color="primary" style={{ margin: 5 }} onClick={() => handleSaveBtn()}>save</Button>
				</div>
			</div>

			<FeatureEditPop 
				value = {{ 
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
					modifyEndCallback
				}}
			/>

			{
				Object.entries(featureInfo).length > 0 ?
					<div className="info_outlineBox">
						<Box textAlign="center" fontWeight="fontWeightMedium" lineHeight={2} fontSize="h6.fontSize">feature information</Box>
						{ Object.entries(featureInfo).filter(([key, value]) => key !== "geometry" && key !== 'geom').map(([key, value]) =>
							<div className="info_container" key={key}> 
								<div className="info_left">
									<a className="inputTit">{key} :</a> 
								</div>
								<div className="info_right">
									{	!['geometry','geom','input_date','student_id'].includes(key) ?
										<input 
											value={value || ""} 
											onChange={(e) => insertFeatureData(key, e.target.value)}
											className="input_data" 
											onFocus={() => focusInInfo()}
											onBlur={(e) => focusOutInfo(key, e.target.value)}
										/> 
										: key === 'input_date' ?
										<input 
											type="date"
											value={moment(new Date(checkUtcTime(value))).format('YYYY-MM-DD') || "yyyy-mm-dd"} 
											onChange={(e) => insertFeatureData(key, e.target.value)} 
											className="input_data" 
											onFocus={(key) => focusInInfo(key)}
											onBlur={(e) => focusOutInfo(key, e.target.value)}
										/> 
										: key === 'student_id' ?
										<input 
											type="number"
											value={value || ""} 
											onChange={(e) => insertFeatureData(key, e.target.value)} 
											className="input_data" 
											onFocus={() => focusInInfo()}
											onBlur={(e) => focusOutInfo(key, e.target.value)}
										/> 
										: null
									}
								</div>
							</div>
						)}
					</div>
				: null
			}
			{ alertOpen 
				? <Alert 
						alertOpen = {alertOpen} 
						setAlertOpen = {setAlertOpen}
						clearDataAndLayer = {clearDataAndLayer} 
					/> 
				: null}
		</>
	)
}