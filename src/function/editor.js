import { Translate, Draw } from "ol/interaction";
import RotateFeatureInteraction from "ol-rotate-feature";
import { getLength } from "ol/sphere";
import GeoJSON from "ol/format/GeoJSON";
import Feature from "ol/Feature";
import {
  Point,
  LineString,
  MultiLineString,
  MultiPoint,
  MultiPolygon,
} from "ol/geom";

import { centroid, lineSplit, simplify } from "@turf/turf";

import { GeoJSONWriter, GeoJSONReader } from "jsts/org/locationtech/jts/io";
import { AffineTransformation } from "jsts/org/locationtech/jts/geom/util";
import MinimumDiameter from "jsts/org/locationtech/jts/algorithm/MinimumDiameter";
import LineSegment from "jsts/org/locationtech/jts/geom/LineSegment";
import DistanceOp from "jsts/org/locationtech/jts/operation/distance/DistanceOp";
import UnionOp from "jsts/org/locationtech/jts/operation/union/UnionOp";
import Polygonizer from "jsts/org/locationtech/jts/operation/polygonize/Polygonizer";
import { LineMerger } from "jsts/org/locationtech/jts/operation/linemerge";

import saveList from "./saveList";
import common from "./common";

// map feature 수정 관련
const editors = {
  // 피쳐 이동 => ol interaction 활용(Translate)
  featureMove: (map, curLyrName, addUndoList) => {
    const translateE = new Translate();
    map.addInteraction(translateE);

    let beforeFeature = null;
    let modifiedFeature = null;

    translateE.on('translatestart', (e) => { 
      beforeFeature = e.features.getArray()[0].clone();
    })

    translateE.on('translateend', (e) => { 
      modifiedFeature = e.features.getArray()[0];
      beforeFeature.setId(modifiedFeature.getId());

      const edited = saveList.setUpdateEdit(map, curLyrName, modifiedFeature, beforeFeature);
      
      addUndoList(edited);
    })
  },
  // 피쳐 회전 => ol-rotate-featue plugin 활용 및 중심점을 구하기 위해 turfjs 활용(centroid)
  rotate: (map, feature, style, curLyrName, addUndoList) => {

    let beforeFeature = null;
    let modifiedFeature = null;

    const featureGeom = {
      type: feature[0].getGeometry().getType(),
      coordinates: feature[0].getGeometry().getCoordinates(),
    };
    const centroidPoint = centroid(featureGeom);
    const rotate = new RotateFeatureInteraction({
      features: feature,
      anchor: centroidPoint.geometry.coordinates,
      angle: (-90 * Math.PI) / 180,
      style,
    });
    map.addInteraction(rotate);

    rotate.on('rotatestart', (e) => { 
      beforeFeature = e.features.getArray()[0].clone();
    })

    rotate.on('rotateend', (e) => { 
      modifiedFeature = e.features.getArray()[0];

      beforeFeature.setId(modifiedFeature.getId());
      const edited = saveList.setUpdateEdit(map, curLyrName, modifiedFeature, beforeFeature);
      
      addUndoList(edited);
    })
  },
  //라인 직선화 => coordinate 변경
  lineStraight: (map, feature, curLyrName, addUndoList) => {

    const beforeFeature = feature.clone();
    const geom = feature.getGeometry();

    if (feature.getGeometry().getType().indexOf("Multi") !== -1) {
      let newGeom = new Array();
      for (let i = 0; i < geom.getCoordinates().length; i++) {
        newGeom.push([
          geom.getCoordinates()[i][0],
          geom.getCoordinates()[i][geom.getCoordinates()[i].length - 1],
        ]);
      }
      geom.setCoordinates(newGeom);
    } else {
      const newGeom = [
        geom.getCoordinates()[0],
        geom.getCoordinates()[geom.getCoordinates().length - 1],
      ];
      geom.setCoordinates(newGeom);
    }
    
    feature.setGeometry(geom);
    const modifiedFeature = feature;
    beforeFeature.setId(modifiedFeature.getId());

    const edited = saveList.setUpdateEdit(map, curLyrName, modifiedFeature, beforeFeature);
    addUndoList(edited);
  },
  //라인 방향반전 => coordinate 변경
  lineReverse: (map, feature, curLyrName, addUndoList) => {
    const beforeFeature = feature.clone();
    const geom = feature.getGeometry();
    if (feature.getGeometry().getType().indexOf("Multi") !== -1) {
      let newGeom = new Array();
      for (let i = 0; i < geom.getCoordinates().length; i++) {
        newGeom.push(geom.getCoordinates()[i].reverse());
      }
      geom.setCoordinates(newGeom);
    } 
    if(feature.getGeometry().getType().indexOf("Multi") === -1){
      const newGeom = geom.getCoordinates().reverse();
      geom.setCoordinates(newGeom);
    }
    
    feature.setGeometry(geom);
    const modifiedFeature = feature;
    beforeFeature.setId(modifiedFeature.getId());

    const edited =saveList.setUpdateEdit(map, curLyrName, modifiedFeature, beforeFeature);
    addUndoList(edited);
  },
  //폴리곤, 라인 단순화 => turfjs 활용(simplify)
  simplify: (map, feature, curLyrName, addUndoList) => {
    const beforeFeature = feature.clone();
    const featureGeom = {
      type: feature.getGeometry().getType(),
      coordinates: feature.getGeometry().getCoordinates(),
    };
    // tolerance options
    // percentage (ex) 아래의 0.05*length를 하여 길이를 구하여 입력)
    // meter (ex) meter 값 입력)
    const length = getLength(feature.getGeometry());
    const tolerance = length * 0.05;
    const options = { tolerance, highQuality: false };
    const simplified = simplify(featureGeom, options);

    const geoJson = new GeoJSON();
    const geom = geoJson.readGeometry(simplified);

    feature.setGeometry(geom);
    const modifiedFeature = feature;
    beforeFeature.setId(modifiedFeature.getId());

    const edited =saveList.setUpdateEdit(map, curLyrName, modifiedFeature, beforeFeature);
    addUndoList(edited);
  },
  // 반전(type => 짧은축:short, 긴축:long)
  reflect: (type, map, feature, curLyrName, addUndoList) => {

    const beforeFeature = feature.clone();

    const featureGeom = {
      type: feature.getGeometry().getType(),
      coordinates: feature.getGeometry().getCoordinates(),
    };

    const reader = new GeoJSONReader();
    const geoJson = new GeoJSON();
    const writer = new GeoJSONWriter();
    const affine = new AffineTransformation();

    const minimumDia = new MinimumDiameter(reader.read(featureGeom), false);
    let minimumRec = minimumDia.getMinimumRectangle();
    if (minimumDia.getMinimumRectangle().getCoordinates().length > 2) {
      const point1 = reader.read({
        type: "Point",
        coordinates: [
          minimumRec.getCoordinates()[0].x,
          minimumRec.getCoordinates()[0].y,
        ],
      });
      const point2 = reader.read({
        type: "Point",
        coordinates: [
          minimumRec.getCoordinates()[1].x,
          minimumRec.getCoordinates()[1].y,
        ],
      });
      const point3 = reader.read({
        type: "Point",
        coordinates: [
          minimumRec.getCoordinates()[2].x,
          minimumRec.getCoordinates()[2].y,
        ],
      });
      const point4 = reader.read({
        type: "Point",
        coordinates: [
          minimumRec.getCoordinates()[3].x,
          minimumRec.getCoordinates()[3].y,
        ],
      });

      let midpoint1 = new LineSegment(
        point1.getCoordinates()[0],
        point2.getCoordinates()[0]
      ).midPoint();
      let midpoint2 = new LineSegment(
        point2.getCoordinates()[0],
        point3.getCoordinates()[0]
      ).midPoint();
      let midpoint3 = new LineSegment(
        point3.getCoordinates()[0],
        point4.getCoordinates()[0]
      ).midPoint();
      let midpoint4 = new LineSegment(
        point4.getCoordinates()[0],
        point1.getCoordinates()[0]
      ).midPoint();

      let resultPoint1 = reader.read({
        type: "Point",
        coordinates: [midpoint1.x, midpoint1.y],
      });
      let resultPoint2 = reader.read({
        type: "Point",
        coordinates: [midpoint2.x, midpoint2.y],
      });
      let resultPoint3 = reader.read({
        type: "Point",
        coordinates: [midpoint3.x, midpoint3.y],
      });
      let resultPoint4 = reader.read({
        type: "Point",
        coordinates: [midpoint4.x, midpoint4.y],
      });

      let distance1 = new DistanceOp(resultPoint1, resultPoint3).distance();
      let distance2 = new DistanceOp(resultPoint2, resultPoint4).distance();

      let shortAxis;
      let longAxis;
      if (distance1 > distance2) {
        longAxis = [
          resultPoint1.getCoordinates()[0].x,
          resultPoint1.getCoordinates()[0].y,
          resultPoint3.getCoordinates()[0].x,
          resultPoint3.getCoordinates()[0].y,
        ];
        shortAxis = [
          resultPoint2.getCoordinates()[0].x,
          resultPoint2.getCoordinates()[0].y,
          resultPoint4.getCoordinates()[0].x,
          resultPoint4.getCoordinates()[0].y,
        ];
      } else {
        longAxis = [
          resultPoint2.getCoordinates()[0].x,
          resultPoint2.getCoordinates()[0].y,
          resultPoint4.getCoordinates()[0].x,
          resultPoint4.getCoordinates()[0].y,
        ];
        shortAxis = [
          resultPoint1.getCoordinates()[0].x,
          resultPoint1.getCoordinates()[0].y,
          resultPoint3.getCoordinates()[0].x,
          resultPoint3.getCoordinates()[0].y,
        ];
      }

      if (type === "short") {
        affine.reflect(shortAxis[0], shortAxis[1], shortAxis[2], shortAxis[3]);
      } else if (type === "long") {
        affine.reflect(longAxis[0], longAxis[1], longAxis[2], longAxis[3]);
      }

      const affineGeom = affine.transform(reader.read(featureGeom));
      const affineGeoJson = geoJson.readGeometry(writer.write(affineGeom));
      feature.setGeometry(affineGeoJson);

      const modifiedFeature = feature;
      beforeFeature.setId(modifiedFeature.getId());

      const edited =saveList.setUpdateEdit(map, curLyrName, modifiedFeature, beforeFeature);
      addUndoList(edited);

    }
  },
  //포인트 한점으로 병합 (포인트들의 가운데 지점으로 병합)
  midPointAdd: (map, curLyrName, features, addUndoList) => {
    //Point (가운데 병합)
    let coords = [];
    const curLyr = common.getCurrentLayer(map, curLyrName);
    // const beforeFeature = features[0].clone();
    let modifiedFeature = null;

    if (features[0].getGeometry().getType() === "Point") {
      let type = "";

      for (let item of features) {
        coords.push(item.getGeometry().getCoordinates());
        curLyr.getSource().removeFeature(item);
      }

      if (features.length > 2) {
        type = "Polygon";
        coords.push(coords[0]);
        coords = [coords];
      } else {
        type = "LineString";
      }

      // 중심점을 구하기 위한 geometry
      const featureGeom = {
        type: type,
        coordinates: coords,
      };

      let centroidPoint = centroid(featureGeom);
      modifiedFeature = new Feature(new Point(centroidPoint.geometry.coordinates));

      const featureProp = common.getClonedFeatureProp(curLyr, features[0] ,modifiedFeature)
      modifiedFeature.setProperties(featureProp); 

      curLyr.getSource().addFeature(modifiedFeature);
    } else if (features[0].getGeometry().getType() === "MultiPoint") {
      //MultiPoint 좌표 병합
      // for(let i=features.length-1; i>=0; i--){
      //   coords.push(features[i].getGeometry().getCoordinates());

      //   if(i !== 0){
      //     layer.getSource().removeFeature(features[i]);
      //   }
      // }

      // const geom = features[0].getGeometry();
      // geom.setCoordinates(coords);

      // features[0].setGeometry(geom);
      const reader = new GeoJSONReader();
      const writer = new GeoJSONWriter();
      const geoJson = new GeoJSON();
      const unionFunc = new UnionOp();

      let mergeGeom = null;
      for (let i = 0; i < features.length; i++) {
        if (!mergeGeom) {
          mergeGeom = reader.read({
            type: features[i].getGeometry().getType(),
            coordinates: features[i].getGeometry().getCoordinates(),
          });
        } else {
          const geom = reader.read({
            type: features[i].getGeometry().getType(),
            coordinates: features[i].getGeometry().getCoordinates(),
          });
          mergeGeom = UnionOp.union(mergeGeom, geom);
        }
      }

      features[0].setGeometry(geoJson.readGeometry(writer.write(mergeGeom)));
      for (let i = features.length - 1; i >= 0; i--) {
        if (i !== 0) {
          map.getLayers().getArray()[1].getSource().removeFeature(features[i]);
        }
      }
    }

    if(modifiedFeature){

      const inserted = saveList.setInsertEdit(map, curLyrName, modifiedFeature);
      const deleted = saveList.setDeleteEdit(map, curLyrName, features)
  
      addUndoList([...inserted, ...deleted]);
    }
  },
  //포인트 병합
  // pointMerge: (map, curLyrName, features, addUndoList) => {
  //   //Point (가운데 병합)
  //   let coords = [];
  //   const curLyr = common.getCurrentLayer(map, curLyrName);
  //   const beforeFeature = features[0].clone();

  //   if (features[0].getGeometry().getType() === "Point") {

  //     const coords = [];

  //     for(let i = 0; i < features.length; i ++){
  //       coords.push(features[i].getGeometry().getCoordinates());
  //       curLyr.getSource().removeFeature(features[i]);
  //     }

  //     const newPoint = new Feature(new MultiPoint(coords));

  //     const prop = common.getClonedFeatureProp(curLyr,features[0] ,newPoint)
  //     newPoint.setProperties(prop);

  //     common.getCurrentLayer(map, curLyrName).getSource().addFeature(newPoint);

  //     const inserted = saveList.setInsertEdit(map, curLyrName, newPoint);
  //     const deleted = saveList.setDeleteEdit(map, curLyrName, features);
  //     addUndoList([...inserted, ...deleted]);
  //   }

  //   if(features[0].getGeometry().getType() === "MultiPoint"){
  //     beforeFeature.setId(features[0].getId());
  
  //     const deletedFeature = features.slice(1, features.length);
  
  //     const updated = saveList.setUpdateEdit(map, curLyrName, features[0], beforeFeature);
  //     const deleted = saveList.setDeleteEdit(map, curLyrName, deletedFeature);
  //     addUndoList([...updated, ...deleted]);
  //   }
  // },
  //라인 병합
  lineStringMerge: (map, features, curLyrName, addUndoList) => {
    const beforeFeature = features[0].clone();

    if (features[0].getGeometry().getType() === "LineString") {
      const reader = new GeoJSONReader();
      const geoJson = new GeoJSON();
      const writer = new GeoJSONWriter();
      const merge = new LineMerger();

      // 병합할 수 있는지 Check
      for (let i = 0; i < features.length; i++) {
        let sNum = 0;
        let eNum = 0;
        let feature = features[i];
        for (let j = 0; j < features.length; j++) {
          if (i !== j) {
            const a = feature.getGeometry().getCoordinates();
            const b = features[j].getGeometry().getCoordinates();
            let sDuplicate = function (a, b) {
              if (a[0][0] === b[0][0] && a[0][1] === b[0][1]) {
                return true;
              }
              if (
                a[0][0] === b[b.length - 1][0] &&
                a[0][1] === b[b.length - 1][1]
              ) {
                return true;
              }
              return false;
            };
            let eDuplicate = function (a, b) {
              if (
                a[a.length - 1][0] === b[0][0] &&
                a[a.length - 1][1] === b[0][1]
              ) {
                return true;
              }
              if (
                a[a.length - 1][0] === b[b.length - 1][0] &&
                a[a.length - 1][1] === b[b.length - 1][1]
              ) {
                return true;
              }
              return false;
            };
            if (sDuplicate(a, b)) {
              sNum += 1;
            }
            if (eDuplicate(a, b)) {
              eNum += 1;
            }
          }
        }
        if (sNum === 0 && eNum === 0) {
          alert("병합 할 수 없습니다.");
          return;
        } else {
          break;
        }
      }

      // geometry merge
      for (let i = 0; i < features.length; i++) {
        const geomObj = {
          type: features[i].getGeometry().getType(),
          coordinates: features[i].getGeometry().getCoordinates(),
        };
        const geom = reader.read(geomObj);
        merge.add(geom);
        if (i !== 0) {
          common.getCurrentLayer(map, curLyrName).getSource().removeFeature(features[i]);
        }
      }

      // create merge geometry
      const newCoord = writer.write(
        merge.getMergedLineStrings().toArray()[0]
      ).coordinates;
      const geomObj = {
        type: "LineString",
        coordinates: newCoord,
      };
      
      // setGeometry
      const newGeom = geoJson.readGeometry(geomObj);
      features[0].setGeometry(newGeom);
      // MultiLineString
    } else if (features[0].getGeometry().getType() === "MultiLineString") {
      const reader = new GeoJSONReader();
      const writer = new GeoJSONWriter();
      const geoJson = new GeoJSON();
      const unionFunc = new UnionOp();

      let mergeGeom = null;
      for (let i = 0; i < features.length; i++) {
        if (!mergeGeom) {
          mergeGeom = reader.read({
            type: features[i].getGeometry().getType(),
            coordinates: features[i].getGeometry().getCoordinates(),
          });
        } else {
          const geom = reader.read({
            type: features[i].getGeometry().getType(),
            coordinates: features[i].getGeometry().getCoordinates(),
          });
          mergeGeom = UnionOp.union(mergeGeom, geom);
        }
      }
      
      features[0].setGeometry(geoJson.readGeometry(writer.write(mergeGeom)));

      for (let i = features.length - 1; i >= 0; i--) {
        if (i !== 0) {
         common.getCurrentLayer(map, curLyrName).getSource().removeFeature(features[i]);
        }
      }
    }

    beforeFeature.setId(features[0].getId());

    const deletedFeature = features.slice(1, features.length)

    const updated = saveList.setUpdateEdit(map, curLyrName, features[0], beforeFeature);
    const deleted = saveList.setDeleteEdit(map, curLyrName, deletedFeature)

    addUndoList([...updated, ...deleted]);
  },
  //폴리곤 병합
  polygonMerge: (map, curLyrName, addUndoList, features) => {
    const reader = new GeoJSONReader();
    const writer = new GeoJSONWriter();
    const geoJson = new GeoJSON();

    const beforeFeature = features[0].clone();

    // 폴리곤 병합
    if (features[0].getGeometry().getType() === "Polygon") {
      let mergeGeom = null;
      for (let i = 0; i < features.length; i++) {
        if (!mergeGeom) {
          mergeGeom = reader.read({
            type: features[i].getGeometry().getType(),
            coordinates: features[i].getGeometry().getCoordinates(),
          });
        } else {
          const geom = reader.read({
            type: features[i].getGeometry().getType(),
            coordinates: features[i].getGeometry().getCoordinates(),
          });
          mergeGeom = UnionOp.union(mergeGeom, geom);
        }
      }

      if (mergeGeom.getGeometryType() !== features[0].getGeometry().getType()) {
        alert(
          "대상 피쳐는 Polygon 이지만, 결과 피쳐는 MultiPolygon 입니다. 서로 겹치거나 맞닿아 있는 피쳐를 선택해서 병합해주세요."
        );
        return;
      } else {
        if (
          features[0].getGeometry().getType() === mergeGeom.getGeometryType()
        ) {
          features[0].setGeometry(
            geoJson.readGeometry(writer.write(mergeGeom))
          );
          for (let i = features.length - 1; i >= 0; i--) {
            if (i !== 0) {
              common.getCurrentLayer(map, curLyrName)
                .getSource()
                .removeFeature(features[i]);
            }
          }
        }
      }
    } else {
      //MultiPolygon 좌표 병합
      let mergeGeom = null;
      for (let i = 0; i < features.length; i++) {
        if (!mergeGeom) {
          mergeGeom = reader.read({
            type: features[i].getGeometry().getType(),
            coordinates: features[i].getGeometry().getCoordinates(),
          });
        } else {
          const geom = reader.read({
            type: features[i].getGeometry().getType(),
            coordinates: features[i].getGeometry().getCoordinates(),
          });
          mergeGeom = UnionOp.union(mergeGeom, geom);
        }
      }

      const deletedFeature = features.slice(1, features.length);
      const outputGeom = geoJson.readGeometry(writer.write(mergeGeom));
      if(outputGeom.getType() === "Polygon"){
        features[0].setGeometry(new MultiPolygon([outputGeom.getCoordinates()]));
      } else {
        features[0].setGeometry(outputGeom);
      }

      for (let i = features.length - 1; i >= 0; i--) {
        if (i !== 0) {
          common.getCurrentLayer(map, curLyrName).getSource().removeFeature(features[i]);
        }
      }

      beforeFeature.setId(features[0].getId());
      
      const updated = saveList.setUpdateEdit(map, curLyrName, features[0], beforeFeature);
      const deleted = saveList.setDeleteEdit(map, curLyrName, deletedFeature)

      addUndoList([...updated, ...deleted]);
    }
  },
  //라인 노드별 분할
  lineNodeSplit: (map, curLyrName, addUndoList, features) => {

    const curLyr = common.getCurrentLayer(map, curLyrName);
    const inserted = [];
    const updated = [];

    for(let feature of features){
      if (feature.getGeometry().getType() === "MultiLineString") {
        const beforeFeature = feature.clone();
  
        let coords = null;
  
        // 선택 피쳐 coordinates
        if (feature.getGeometry().getType().indexOf("Multi") !== -1) {
          coords = feature.getGeometry().getCoordinates()[0];
        } else {
          coords = feature.getGeometry().getCoordinates();
        }
  
        // coordinate가 2개 이상 (노드가 2개 이상이면)
        if (coords.length > 2) {
          for (let i = 0; i < coords.length; i++) {
            if (i === 0) {
              const coord = coords.slice(i, i + 2);
              const geom = feature.getGeometry();
              if (feature.getGeometry().getType().indexOf("Multi") !== -1) {
                geom.setCoordinates([coord]);
              } else {
                geom.setCoordinates(coord);
              }
              feature.setGeometry(geom);
              const modifiedFeature = feature;
              beforeFeature.setId(modifiedFeature.getId());
              const updateEdit = saveList.setUpdateEdit(map, curLyrName, modifiedFeature, beforeFeature);
             
              updated.push(updateEdit[0]);
            } else {
              const coord = coords.slice(i, i + 2);
              let newFeature = null;
              if (feature.getGeometry().getType().indexOf("Multi") !== -1) {
                newFeature = new Feature(new MultiLineString([coord]));
              } else {
                newFeature = new Feature(new LineString(coord));
              }
              const newProp = common.getClonedFeatureProp(curLyr, feature, newFeature);
              newFeature.setProperties(newProp);
              
              if (coord.length > 1) {
                curLyr.getSource().addFeature(newFeature);
              
                const insertEdit = saveList.setInsertEdit(map, curLyrName, newFeature);
                inserted.push(insertEdit[0]); 
              }
            }
          }
          
        } else {
          alert("분할피쳐 없음");
        }
      } 
    }
    addUndoList([...updated, ...inserted]);
  },
  //포인트 분할
  pointSplit: (map, feature, curLyrName, addUndoList) => {
    if (feature.getGeometry().getType() === "MultiPoint") {

      const inserted = [];
      const updated = [];
      const beforeFeature = feature.clone();
      const curLyr = common.getCurrentLayer(map, curLyrName);
      const coords = feature.getGeometry.getCoordinates();

      // coords.length가 1인 경우는 호출할 때 예외처리해야 함(popup이 안뜨도록)
      for(let i = 1; i < coords.length; i++){
        const newFeature = new Feature(new MultiPoint(coords[i]));
        const newProp = common.getClonedFeatureProp(curLyr, feature, newFeature);

        newFeature.setProperties(newProp);
        curLyr.getSource().addFeature(newFeature);

        const insertEdited = saveList.setInsertEdit(map, curLyrName, newFeature);
        inserted.push(insertEdited[0]);
      }
      feature.setGeometry(new MultiPoint(coords[0]));

      const modifiedFeature = feature;
      beforeFeature.setId(modifiedFeature)

      const updateEdit = saveList.setUpdateEdit(map, curLyrName, modifiedFeature, beforeFeature);
      updated.push(updateEdit[0]);
      
      addUndoList([...inserted, ...updated]);
    }
  },
  // 라인  분할
  lineSplit: (map, feature, curLyrName, addUndoList) => {
    if (feature.getGeometry().getType() === "LineString") {
    } else if (feature.getGeometry().getType() === "MultiLineString") {
      const inserted = [];
      const updated = [];
      const beforeFeature = feature.clone();
      const curLyr = common.getCurrentLayer(map, curLyrName);
      const coords = feature.getGeometry().getCoordinates();

      for(let i = 1; i < coords.length; i++){
        const newFeature = new Feature(new MultiLineString([coords[i]]));
        const newProp = common.getClonedFeatureProp(curLyr, feature, newFeature);

        newFeature.setProperties(newProp);
        curLyr.getSource().addFeature(newFeature);

        const insertEdited = saveList.setInsertEdit(map, curLyrName, newFeature);
        inserted.push(insertEdited[0]);
      }

      feature.setGeometry(new MultiLineString([coords[0]]));

      const modifiedFeature = feature;
      beforeFeature.setId(modifiedFeature.getId());

      const updateEdit = saveList.setUpdateEdit(map, curLyrName, modifiedFeature, beforeFeature);
      updated.push(updateEdit[0]);
      
      addUndoList([...inserted, ...updated]);
    }
  },
  // 폴리곤 분할
  polygonSplit: (map, feature, curLyrName, addUndoList) => {
    if (feature.getGeometry().getType() === "Polygon") {
    } else if (feature.getGeometry().getType() === "MultiPolygon") {
      const inserted = [];
      const updated = [];
      const beforeFeature = feature.clone();
      const curLyr = common.getCurrentLayer(map, curLyrName);
      const coords = feature.getGeometry().getCoordinates();

      for(let i = 1; i < coords.length; i++){
        const newFeature = new Feature(new MultiPolygon([coords[i]]));
        const newProp = common.getClonedFeatureProp(curLyr, feature, newFeature);

        newFeature.setProperties(newProp);
        curLyr.getSource().addFeature(newFeature);

        const insertEdited = saveList.setInsertEdit(map, curLyrName, newFeature);
        inserted.push(insertEdited[0]);
      }

      feature.setGeometry(new MultiPolygon([coords[0]]));

      const modifiedFeature = feature;
      beforeFeature.setId(modifiedFeature.getId());

      const updateEdit = saveList.setUpdateEdit(map, curLyrName, modifiedFeature, beforeFeature);
      updated.push(updateEdit[0]);
      addUndoList([...inserted, ...updated]);
    }
  },
  //라인 선으로 분할 (turf.js lineSplit)
  lineDrawSplit: (map, feature, curLyrName, addUndoList, select) => {
    const curLyr = common.getCurrentLayer(map, curLyrName);
    const beforeFeature = feature.clone();

    const inserted = [];

    if (feature.getGeometry().getType() === "MultiLineString") {
      map.removeInteraction(select);

      const targetLine = new Feature(new LineString(feature.getGeometry().getCoordinates()[0]));

      const drawEvent = new Draw({
        geometryName: "geom",
        type: "LineString",
      });

      drawEvent.on("drawend", function (e) {
        const geoJson = new GeoJSON();
        const target = geoJson.writeFeatureObject(targetLine)
        const splitLine = geoJson.writeFeatureObject(e.feature)
      
        const intersect = lineSplit(target, splitLine);

        if (intersect.features.length > 1) {
          for (let i = 0; i < intersect.features.length; i++) {
            if (i === 0) {

              const newGeom = intersect.features[0].geometry.coordinates;
              feature.setGeometry(new MultiLineString([newGeom]))
            
            } else {
              const addGeom = intersect.features[i].geometry.coordinates;
              const addFeature = new Feature(new MultiLineString([addGeom]));
              const newProp = common.getClonedFeatureProp(curLyr, feature, addFeature);

              addFeature.setProperties(newProp);
              curLyr.getSource().addFeature(addFeature);

              const insertEdit = saveList.setInsertEdit(map, curLyrName, addFeature);
              inserted.push(insertEdit[0]);
            }
          }

          beforeFeature.setId(feature.getId());
          const updated = saveList.setUpdateEdit(map, curLyrName, feature, beforeFeature);
          addUndoList([...updated, ...inserted]);

        } else {
          alert("분할할 피쳐가 없습니다.");
        }

        map.removeInteraction(this);
        map.addInteraction(select);
      });
      map.addInteraction(drawEvent);
    } else if (feature.getGeometry().getType() === "LineString") {
    }
  },
  //폴리곤 분할
  polygonDrawSplit: (map, feature, curLyrName, addUndoList, select) => {

    const beforeFeature = feature.clone();
    const curLyr = common.getCurrentLayer(map, curLyrName);
    const inserted = [];

    if (feature.getGeometry().getType() === "Polygon") {
      map.removeInteraction(select);

      const drawEvent = new Draw({
        //source: source,
        geometryName: "geom",
        type: "LineString",
      });

      drawEvent.on("drawend", function (e) {
        const reader = new GeoJSONReader();
        const writer = new GeoJSONWriter();
        const geoJson = new GeoJSON();

        const target = reader.read({
          type: feature.getGeometry().getType(),
          coordinates: feature.getGeometry().getCoordinates(),
        });
        const splitLine = reader.read({
          type: e.feature.getGeometry().getType(),
          coordinates: e.feature.getGeometry().getCoordinates(),
        });

        const unionFunc = new UnionOp();
        const union = unionFunc
          .getClass()
          .union(target.getExteriorRing(), splitLine);
        const polygonizer = new Polygonizer();
        polygonizer.add(union);

        const polygons = polygonizer.getPolygons();

        if (polygons.array.length > 1) {
          for (let i = 0; i < polygons.array.length; i++) {
            if (i === 0) {
              feature.setGeometry(
                geoJson.readGeometry(writer.write(polygons.array[i]))
              );
            } else {
              const newFeature = new Feature(
                geoJson.readGeometry(writer.write(polygons.array[i]))
              );
              //feature.setProperties(feature.getProperties());
              map.getLayers().getArray()[1].getSource().addFeature(newFeature);
            }
          }
        } else {
          alert("분할할 피쳐가 없습니다.");
        }

        map.removeInteraction(this);
        map.addInteraction(select);
      });
      map.addInteraction(drawEvent);
    } else if (feature.getGeometry().getType() === "MultiPolygon") {
      map.removeInteraction(select);

      const drawEvent = new Draw({
        geometryName: "geom",
        type: "LineString",
      });

      drawEvent.on("drawend", function (e) {
        const reader = new GeoJSONReader();
        const writer = new GeoJSONWriter();
        const geoJson = new GeoJSON();

        const target = reader.read({
          type: 'Polygon',
          coordinates: feature.getGeometry().getCoordinates()[0]
        });

        const splitLine = reader.read({
          type: e.feature.getGeometry().getType(),
          coordinates: e.feature.getGeometry().getCoordinates(),
        });

        const union = UnionOp.union(target.getExteriorRing(), splitLine);
        const polygonizer = new Polygonizer();
        polygonizer.add(union);

        const polygons = polygonizer.getPolygons();
        
        if (polygons.array.length > 1) {
          for (let i = 0; i < polygons.array.length; i++) {

            const readGeom = geoJson.readGeometry(writer.write(polygons.array[i]))

            if (i === 0) {
              feature.setGeometry(new MultiPolygon([readGeom.getCoordinates()]));
            } else {
              const newFeature = new Feature(
                new MultiPolygon([readGeom.getCoordinates()])
              );
              const newProp = common.getClonedFeatureProp(curLyr, feature, newFeature);
              newFeature.setProperties(newProp);
              curLyr.getSource().addFeature(newFeature);
              
              const insertEdit = saveList.setInsertEdit(map, curLyrName, newFeature);
              inserted.push(insertEdit[0]);
            }
          }

          const modifiedFeature = feature;
          beforeFeature.setId(modifiedFeature.getId());

          const updated = saveList.setUpdateEdit(map, curLyrName, modifiedFeature, beforeFeature);

          addUndoList([...updated, ...inserted])

        } else {
          alert("분할할 피쳐가 없습니다.");
        }

        map.removeInteraction(this);
        map.addInteraction(select);
      });
      map.addInteraction(drawEvent);
    }
  },
};

export default editors;
