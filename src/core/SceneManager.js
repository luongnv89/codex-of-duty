import * as THREE from 'three';

export class SceneManager {
  constructor(game) {
    this.game = game;
    this.scene = null;
    this.camera = null;
    this.lights = new Map();
    this.fog = null;
    this.sky = null;
    this.skyTime = 0;
  }

  async init() {
    this.scene = new THREE.Scene();

    this.scene.background = new THREE.Color(0x6f93a8);
    this.scene.fog = new THREE.FogExp2(0x82958b, 0.0038);
    this.fog = this.scene.fog;

    this.camera = new THREE.PerspectiveCamera(
      90,
      window.innerWidth / window.innerHeight,
      0.01,
      2000
    );
    this.camera.position.set(0, 1.6, 0);
    const viewLight = new THREE.PointLight(0xdde8ff, 1.8, 5, 1.4);
    viewLight.position.set(0, 0.3, 0.5);
    viewLight.name = 'view-fill';
    this.camera.add(viewLight);
    this.scene.add(this.camera);

    this.setupAmbientLight();
    this.setupDirectionalLight();
    this.setupHemisphereLight();
    this.setupSky();
  }

  setupAmbientLight() {
    const ambient = new THREE.AmbientLight(0xb7c7bd, 1.25);
    this.scene.add(ambient);
    this.lights.set('ambient', ambient);
  }

  setupDirectionalLight() {
    const dirLight = new THREE.DirectionalLight(0xffedcf, 4.0);
    dirLight.position.set(-80, 140, 60);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 500;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    dirLight.shadow.bias = -0.0001;
    dirLight.shadow.normalBias = 0.02;
    dirLight.shadow.radius = 4;
    dirLight.shadow.autoUpdate = true;
    dirLight.name = 'sun';
    this.scene.add(dirLight);
    this.lights.set('directional', dirLight);

  }

  setupHemisphereLight() {
    const hemiLight = new THREE.HemisphereLight(0xa9cee0, 0x53614e, 1.35);
    hemiLight.position.set(0, 500, 0);
    this.scene.add(hemiLight);
    this.lights.set('hemisphere', hemiLight);
  }

  setupSky() {
    const skyGeometry = new THREE.SphereGeometry(1000, 32, 24);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x4f83a6) },
        horizonColor: { value: new THREE.Color(0xd8c69f) },
        bottomColor: { value: new THREE.Color(0x6f8069) },
        sunDirection: { value: new THREE.Vector3(-0.45, 0.48, -0.6).normalize() },
        time: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform vec3 sunDirection;
        uniform float time;
        varying vec3 vDirection;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float value = 0.0;
          value += noise(p) * 0.55;
          value += noise(p * 2.03 + 17.2) * 0.28;
          value += noise(p * 4.07 - 9.4) * 0.12;
          return value;
        }
        void main() {
          vec3 dir = normalize(vDirection);
          float h = dir.y;
          vec3 color = h > 0.0
            ? mix(horizonColor, topColor, smoothstep(0.0, 0.82, h))
            : mix(horizonColor, bottomColor, smoothstep(0.0, 0.35, -h));

          float horizonGlow = pow(1.0 - max(h, 0.0), 5.0);
          color += vec3(0.16, 0.10, 0.045) * horizonGlow;

          float sunDot = max(dot(dir, sunDirection), 0.0);
          float sunDisc = pow(sunDot, 650.0);
          float sunHalo = pow(sunDot, 22.0);
          color += vec3(1.0, 0.72, 0.35) * sunDisc * 5.0;
          color += vec3(1.0, 0.48, 0.18) * sunHalo * 0.65;

          if (h > 0.025) {
            vec2 cloudUv = dir.xz / max(0.16, h + 0.25);
            cloudUv = cloudUv * 2.1 + vec2(time * 0.006, time * 0.002);
            float clouds = smoothstep(0.5, 0.72, fbm(cloudUv));
            clouds *= smoothstep(0.03, 0.18, h) * (1.0 - smoothstep(0.72, 0.96, h));
            vec3 cloudColor = mix(vec3(0.58, 0.63, 0.64), vec3(1.0, 0.93, 0.80), sunDot);
            color = mix(color, cloudColor, clouds * 0.52);
          }
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.name = 'sky';
    sky.frustumCulled = false;
    this.sky = sky;
    this.scene.add(sky);
  }

  update(deltaTime) {
    if (!this.sky || !this.camera) return;
    this.skyTime += deltaTime;
    this.sky.position.copy(this.camera.position);
    this.sky.material.uniforms.time.value = this.skyTime;
  }

  setFogDensity(density) {
    if (this.fog) {
      this.fog.density = density;
    }
  }

  setTimeOfDay(hours) {
    const sun = this.lights.get('directional');
    if (sun) {
      const angle = (hours / 24) * Math.PI * 2;
      sun.position.x = Math.cos(angle) * 200;
      sun.position.y = Math.sin(angle) * 200;
      sun.position.z = Math.sin(angle) * 100;
      sun.intensity = Math.max(0.1, Math.sin(angle) * 2);
    }
  }
}
