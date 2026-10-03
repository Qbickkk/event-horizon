#version 300 es
// Halves resolution with a 4-tap box filter; on the first bloom level also keeps only light above the threshold.
precision highp float;

in vec2 vUv;
out vec4 o;

uniform sampler2D uSrc;
uniform vec2 uTexel;    // 1 / source size
uniform float uThresh;  // 0 disables the threshold
uniform float uHdrInv;

void main() {
  vec3 c = texture(uSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb
         + texture(uSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb
         + texture(uSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb
         + texture(uSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;

  if (uThresh > 0.0) {
    // soft knee so the cutoff does not band
    float br = max(c.r, max(c.g, c.b)) * uHdrInv;
    float knee = uThresh * 0.5;
    float soft = clamp(br - uThresh + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    c *= max(soft, br - uThresh) / max(br, 1e-4);
  }

  o = vec4(c, 1.0);
}
