// Build the demo car for the plate-frame viewer from Khronos "Car Concept"
// (CC-BY 4.0, Khronos logos excluded from the licence, so they are removed).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMaterialsVariants } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify, textureCompress, quantize, reorder, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [, , src = 'CarConcept.glb', out = 'car.glb'] = process.argv;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);
const root = doc.getRoot();

// 1. Drop the model's own plate (Khronos logo) and interior parts nobody sees.
const drop = /^License Plate$|Pedal|Steering|Dash|Floormats|^Engine$|^InteriorDoor/;
for (const n of root.listNodes()) if (drop.test(n.getName())) n.dispose();

// 2. Graphite paint (closest to a dark Tesla) instead of the default carmine;
//    one graphite for both paint groups (Paint 2 Graphite is iridescent).
const mat = (name) => root.listMaterials().find((m) => m.getName() === name);
const swap = { 'Paint 1 Carmine': 'Paint 1 Graphite', 'Paint 2 Carmine': 'Paint 1 Graphite', 'Interior 3 Carmine': 'Interior 3 Graphite' };
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  const to = swap[p.getMaterial()?.getName()];
  if (to && mat(to)) p.setMaterial(mat(to));
}
for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'KHR_materials_variants') ext.dispose();

// 3. Remove logos: the Khronos logo texture (emissive on rims, mirrors, glass)
//    goes black; the tyre sidewall texture (KHRONOS lettering) goes flat.
const texs = root.listTextures();
const logo = texs.find((t) => t.getSize()?.[0] === 512 && t.getSize()?.[1] === 128 && root.listMaterials().some((m) => m.getName() === 'License' && m.getBaseColorTexture() === t));
const solid = async (rgb) => sharp({ create: { width: 4, height: 4, channels: 3, background: rgb } }).png().toBuffer();
if (logo) logo.setImage(await solid({ r: 0, g: 0, b: 0 }));
const tireside = mat('Tireside')?.getBaseColorTexture();
if (tireside) {
  const { data } = await sharp(tireside.getImage()).resize(1, 1).raw().toBuffer({ resolveWithObject: true });
  tireside.setImage(await solid({ r: data[0], g: data[1], b: data[2] }));
}
console.log('logo blanked:', !!logo, 'tireside flattened:', !!tireside);

// 4. Shrink.
await doc.transform(
  prune(), dedup(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.0008 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 80 }),
  reorder({ encoder: MeshoptEncoder }), quantize(), prune(),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(out, doc);
