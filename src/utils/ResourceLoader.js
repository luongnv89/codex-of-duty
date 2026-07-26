import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { TextureLoader, AudioLoader } from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';

export class ResourceLoader {
  constructor() {
    this.cache = new Map();
    this.loadingManager = new THREE.LoadingManager();
    this.loadingManager.onProgress = (url, loaded, total) => {
      const percent = Math.round((loaded / total) * 100);
    };

    this.gltfLoader = new GLTFLoader(this.loadingManager);
    this.dracoLoader = new DRACOLoader(this.loadingManager);
    this.dracoLoader.setDecoderPath('/node_modules/three/examples/jsm/libs/draco/gltf/');
    this.rgbeLoader = new RGBELoader(this.loadingManager);
    this.textureLoader = new TextureLoader(this.loadingManager);
    this.audioLoader = new AudioLoader(this.loadingManager);
    this.fontLoader = new FontLoader(this.loadingManager);

    this.pendingLoads = new Set();
  }

  loadGLTF(url) {
    if (this.cache.has(url)) {
      return Promise.resolve(this.cache.get(url));
    }

    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf) => {
          gltf.scene.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.frustumCulled = true;
            }
          });
          this.cache.set(url, gltf);
          resolve(gltf);
        },
        undefined,
        (error) => {
          console.error('Failed to load GLTF:', url, error);
          reject(error);
        }
      );
    });
  }

  loadTexture(url, options = {}) {
    if (this.cache.has(url)) {
      return Promise.resolve(this.cache.get(url));
    }

    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          if (options.colorSpace) {
            texture.colorSpace = options.colorSpace;
          }
          if (options.repeat) {
            texture.repeat.set(options.repeat.x, options.repeat.y);
          }
          if (options.wrapS) texture.wrapS = options.wrapS;
          if (options.wrapT) texture.wrapT = options.wrapT;
          if (options.anisotropy) {
            texture.anisotropy = Math.min(options.anisotropy, 16);
          }
          if (options.magFilter) texture.magFilter = options.magFilter;
          if (options.minFilter) texture.minFilter = options.minFilter;
          this.cache.set(url, texture);
          resolve(texture);
        },
        undefined,
        (error) => {
          console.error('Failed to load texture:', url, error);
          reject(error);
        }
      );
    });
  }

  loadHDR(url) {
    if (this.cache.has(url)) {
      return Promise.resolve(this.cache.get(url));
    }

    return new Promise((resolve, reject) => {
      this.rgbeLoader.load(
        url,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          this.cache.set(url, texture);
          resolve(texture);
        },
        undefined,
        (error) => {
          console.error('Failed to load HDR:', url, error);
          reject(error);
        }
      );
    });
  }

  loadAudio(url) {
    if (this.cache.has(url)) {
      return Promise.resolve(this.cache.get(url));
    }

    return new Promise((resolve, reject) => {
      this.audioLoader.load(
        url,
        (buffer) => {
          this.cache.set(url, buffer);
          resolve(buffer);
        },
        undefined,
        (error) => {
          console.error('Failed to load audio:', url, error);
          reject(error);
        }
      );
    });
  }

  loadFont(url) {
    if (this.cache.has(url)) {
      return Promise.resolve(this.cache.get(url));
    }

    return new Promise((resolve, reject) => {
      this.fontLoader.load(
        url,
        (font) => {
          this.cache.set(url, font);
          resolve(font);
        },
        undefined,
        (error) => {
          console.error('Failed to load font:', url, error);
          reject(error);
        }
      );
    });
  }

  async loadAll(resources) {
    const promises = [];
    for (const { type, url, options } of resources) {
      switch (type) {
        case 'gltf':
          promises.push(this.loadGLTF(url));
          break;
        case 'texture':
          promises.push(this.loadTexture(url, options));
          break;
        case 'hdr':
          promises.push(this.loadHDR(url));
          break;
        case 'audio':
          promises.push(this.loadAudio(url));
          break;
        case 'font':
          promises.push(this.loadFont(url));
          break;
      }
    }
    return Promise.allSettled(promises);
  }

  get(url) {
    return this.cache.get(url);
  }

  has(url) {
    return this.cache.has(url);
  }
}
