Draco decoder from three.js r169 (`examples/jsm/libs/draco/gltf/`), MIT.

Decoder only. The encoder in that folder is 932KB and nothing here ever writes
a .glb, so it is not vendored. Most exporters compress meshes with Draco by
default, which is why this is here at all: without it, a perfectly ordinary
.glb fails to load with "No DRACOLoader instance provided" and the model
simply does not appear.
