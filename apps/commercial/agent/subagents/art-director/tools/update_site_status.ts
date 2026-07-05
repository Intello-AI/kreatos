// Re-export: el art-director comparte esta tool con site-builder (misma
// implementación). La usa para marcar `generating` al ARRANCAR la composición
// del spec — así el status refleja que ya se está trabajando, sin esperar a
// que site-builder llegue a su fase build.
export { default } from "../../site-builder/tools/update_site_status"
