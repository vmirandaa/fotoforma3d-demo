// Visor 3D (model-viewer): lo comparten la portada, el creador, Mi pedido y el panel.
export const VIEWER_SCRIPT = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.4.0/model-viewer.min.js';
export const PRINT_WHITE = [0.93, 0.92, 0.89, 1]; // blanco del creador y el panel
export const SAMPLE_WHITE = [0.88, 0.87, 0.83, 1]; // blanco algo más cálido de la portada y Mi pedido
// Guarda los colores originales de cada material para poder volver a ellos después de mostrarla en blanco.
export function viewerMaterials(viewer) {
  return ((viewer.model && viewer.model.materials) || []).map((material) => {
    const pbr = material.pbrMetallicRoughness;
    return {
      pbr,
      color: Array.from(pbr.baseColorFactor),
      metallic: pbr.metallicFactor,
      roughness: pbr.roughnessFactor,
      colorTexture: pbr.baseColorTexture ? pbr.baseColorTexture.texture : null,
      surfaceTexture: pbr.metallicRoughnessTexture ? pbr.metallicRoughnessTexture.texture : null
    };
  });
}
// En blanco (como se imprime) o con los colores del modelo generado.
export function paintMaterials(materials, white, whiteColor = PRINT_WHITE) {
  materials.forEach((entry) => {
    const { pbr } = entry;
    if (pbr.baseColorTexture) pbr.baseColorTexture.setTexture(white ? null : entry.colorTexture);
    if (pbr.metallicRoughnessTexture) pbr.metallicRoughnessTexture.setTexture(white ? null : entry.surfaceTexture);
    pbr.setBaseColorFactor(white ? whiteColor : entry.color);
    pbr.setMetallicFactor(white ? 0 : entry.metallic);
    pbr.setRoughnessFactor(white ? 0.82 : entry.roughness);
  });
}
