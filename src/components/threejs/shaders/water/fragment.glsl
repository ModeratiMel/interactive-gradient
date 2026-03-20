// pre imported uniforms
uniform vec3 uDepthColor;
uniform vec3 uSurfaceColor;
uniform float uColorOffset;
uniform float uColorMultiplier;

uniform vec2 uMouse;

varying float vElevation;

void main () {
    //mix of 1 and 2 according to 3
    float mixStregnth = ((vElevation + uColorOffset) * uColorMultiplier) + (uMouse.x/4.0);
    vec3 color = mix(uDepthColor, uSurfaceColor, (mixStregnth + (uMouse.y/4.0)));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment> //need to define color space
}