#version 300 es
// 9-tap Gaussian along uDir, using bilinear taps so it costs 5 fetches.
precision highp float;

in vec2 vUv;
out vec4 o;

uniform sampler2D uSrc;
uniform vec2 uDir;  // one texel along the blur axis

void main() {
  vec3 c = texture(uSrc, vUv).rgb * 0.2270270270;
  c += texture(uSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture(uSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  o = vec4(c, 1.0);
}
