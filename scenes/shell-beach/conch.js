// The Singing Conch is the owner's Meshy model, reduced for the game to 6,313
// triangles and one 1024 colour map by reduce-conch.py (public/models/
// accepted-scenes/singing-conch.glb). The page or the game loads it before the
// scene is built and hands it over as CONCH_ASSET {geometry, map}. In its own
// frame the spire points to -X, the mouth to +X, and the opening faces +Z.
function giantConch(){
  const root=new THREE.Group();root.name='Singing Conch';
  // Its footprint at hero height, measured from the placed model (spire tip and
  // the raised whorls above it stay open).
  for(const[u,v,r]of[[.577,.476,.75],[.604,.467,1],[.637,.472,1.5],[.678,.47,1.7],[.719,.47,1.45],[.755,.478,1]]){
    const[x,z]=P(u,v);COLLIDERS.push({x,z,r:M(r)});
  }
  if(!CONCH_ASSET)return root;   // data export: colliders only
  // Lay it on the sand as in the concept: spire to the left, the mouth turned
  // to the right and towards the camera (YAW), rolled a little about its length
  // so the opening tilts up (OPEN), and bedded in the sand (SINK).
  const YAW=.35,OPEN=.15,SIZE=M(10.6),FOCUS=[.615,.465],SINK=M(.33);
  // a warm tint keeps the near-white map from burning out in the sun; the
  // model's own smooth normals are kept (recomputed ones facet its long faces)
  const mesh=new THREE.Mesh(CONCH_ASSET.geometry,paint({map:CONCH_ASSET.map,color:'#f1e9dc',side:THREE.DoubleSide,shade:[.64,.6,.57],mid:[.9,.87,.82],band:[-.3,.2]}));
  mesh.name='singing-conch';mesh.userData.authoredNormals=true;mesh.rotation.set(OPEN,YAW,0,'YXZ');mesh.scale.setScalar(SIZE);mesh.updateMatrix();
  // the turned shell's own extent, vertex by vertex (a turned bounding box would float it)
  const box=new THREE.Box3(),v=new V3(),pos=CONCH_ASSET.geometry.attributes.position;
  for(let i=0;i<pos.count;i++)box.expandByPoint(v.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrix));
  const c=box.getCenter(new V3());
  const[x,z]=P(FOCUS[0],FOCUS[1]);
  mesh.position.set(x-c.x,height(x,z)-box.min.y-SINK,z-c.z);
  mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
  return root;
}
