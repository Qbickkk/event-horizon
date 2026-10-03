#version 300 es
// Adds bloom, tone-maps with ACES, applies gamma, a light vignette and dither against banding.
precision highp float;

in vec2 vUv;
out vec4 o;

uniform sampler2D uScene;
uniform sampler2D uB1;
uniform sampler2D uB2;
uniform sampler2D uB3;
uniform float uHdrInv;
uniform float uExposure;
uniform float uBloom;
uniform float uTime;
uniform vec2 uRes;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 c = texture(uScene, vUv).rgb;
  vec3 b = texture(uB1, vUv).rgb * 0.5 + texture(uB2, vUv).rgb * 0.35 + texture(uB3, vUv).rgb * 0.35;
  c = (c + b * uBloom) * uHdrInv * uExposure;
  c = aces(c);

  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y;
  c *= mix(1.0, smoothstep(1.15, 0.2, length(q)), 0.35);

  c = pow(c, vec3(1.0 / 2.2));
  c += (hash12(gl_FragCoord.xy + fract(uTime) * 97.0) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}
