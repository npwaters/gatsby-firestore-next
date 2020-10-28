exports.sourceNodes = async (
  {actions, boundActionCreators, reporter, createNodeId, createContentDigest},
  {types, credential, appConfig, refTypes}
) => {
  // configure firebase-admin
  const firebase = initFirebase();
  const db = firebase.firestore();
  const myRefTypes = refTypes;

  // gatsby v1 fallback
  const { createNode } = actions || boundActionCreators;

  // creates node for provided type
  async function createDocumentNode({ type, parent = null }) {
    // contruct firestore collectionName for current type
    const collectionName =
      parent && parent.collectionName
        ? `${parent.collectionName}/${parent.id}/${type.collection}`
        : type.collection;

    // get records for current type from firestore
    const snapshot = await db.collection(collectionName).get();
    const promises = [];
    snapshot.forEach(doc => {
      promises.push(
        new Promise(async resolve => {
          let children = [];
          if (type.subCollections) {
            // if any subCollections exists, recursively create new nodes
            const subCollectionIds = await Promise.all(
              type.subCollections.map(subCollection =>
                createDocumentNode({
                  type: subCollection,
                  parent: {id: doc.id, ...type, collectionName}
                })
              )
            );
            console.log(type.subCollections);
            // add IDs of all subCollection nodes to children
            type.subCollections.map((subCollection, i) => {
              children = [...children, ...subCollectionIds[i]];
            });
          }
          let newItem = doc.data();
          const result = myRefTypes.find(element => collectionName.includes(element));
          if (result) {
            let ex = await doc.get(result).get()
              .then(
                exercise => {
                  return exercise.data();
                }
              )
            console.log(JSON.stringify(ex));
            newItem = Object.assign(newItem, ex);
          }

          let newNode = {
            parent: parent ? parent.id : null,
            children,
            internal: {
              type: type.type,
              contentDigest: createContentDigest(doc.id),
            },
            ...type.map(newItem),
          };
          newNode["id"] = doc.id;
          console.log(newNode);
          // create node for current type
          createNode(newNode);
          // resolve with current document ID
          resolve(doc.id);
        })
      );
    });
    return Promise.all(promises);
  }

  function initFirebase() {
    const firebase = require('firebase');
    try {
      if (firebase.apps || !firebase.apps.length) {
        const cfg = appConfig
          ? appConfig
          : { credential: firebase.credential.cert(credential) };
        firebase.initializeApp(cfg);
        return firebase;
      }
      return firebase;
    } catch (e) {
      reporter.error(
        'Could not initialize Firebase. Please check `credential` property in gatsby-config.js'
      );
      return;
    }
  }

  // main call to create nodes for all provided types
  await Promise.all(types.map(type => createDocumentNode({ type })));
  return;
};
