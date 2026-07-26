import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export class PhysicsWorld {
  constructor(game) {
    this.game = game;
    this.world = null;
    this.gravity = { x: 0, y: -30, z: 0 };
    this.tempVector = new THREE.Vector3();
    this._initGroups();
  }

  _initGroups() {
    this.GROUP_PLAYER = 0x0001;
    this.GROUP_ENEMY = 0x0002;
    this.GROUP_PROJECTILE = 0x0004;
    this.GROUP_WORLD = 0x0008;
    this.GROUP_SENSOR = 0x0010;
  }

  _interaction(membership, filter) {
    return (membership << 16) | filter;
  }

  async init() {
    await RAPIER.init();
    this.world = new RAPIER.World(this.gravity);
    this.world.timestep = 1 / 120;
  }

  createBody(config) {
    const { type = 'dynamic', position = { x: 0, y: 0, z: 0 }, rotation = { x: 0, y: 0, z: 0 }, mass = 1, linearDamping = 0, angularDamping = 0 } = config;

    let bodyDesc;
    if (type === 'kinematic') {
      bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
    } else if (type === 'static') {
      bodyDesc = RAPIER.RigidBodyDesc.fixed();
    } else {
      bodyDesc = RAPIER.RigidBodyDesc.dynamic();
    }

    bodyDesc.setTranslation(position.x, position.y, position.z);
    const quaternionLengthSq = rotation.w === undefined
      ? 0
      : rotation.x ** 2 + rotation.y ** 2 + rotation.z ** 2 + rotation.w ** 2;
    if (rotation.w !== undefined && Math.abs(quaternionLengthSq - 1) < 0.001) {
      bodyDesc.setRotation(rotation);
    } else if (rotation.x || rotation.y || rotation.z) {
      const quaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rotation.x, rotation.y, rotation.z)
      );
      bodyDesc.setRotation(quaternion);
    }
    bodyDesc.setLinearDamping(linearDamping);
    bodyDesc.setAngularDamping(angularDamping);

    const body = this.world.createRigidBody(bodyDesc);
    body.userData = { id: config.id, type: config.bodyType || 'generic' };
    return body;
  }

  createCollider(body, shape, config = {}) {
    const { offset = { x: 0, y: 0, z: 0 }, friction = 0.7, restitution = 0.3, isSensor = false, groups = this.GROUP_WORLD } = config;

    let colliderDesc;
    switch (shape) {
      case 'box':
        colliderDesc = RAPIER.ColliderDesc.cuboid(config.size.x, config.size.y, config.size.z);
        break;
      case 'sphere':
        colliderDesc = RAPIER.ColliderDesc.ball(config.radius);
        break;
      case 'capsule':
        colliderDesc = RAPIER.ColliderDesc.capsule(config.halfHeight, config.radius);
        break;
      case 'cylinder':
        colliderDesc = RAPIER.ColliderDesc.cylinder(config.halfHeight, config.radius);
        break;
      case 'mesh':
        colliderDesc = RAPIER.ColliderDesc.trimesh(config.vertices, config.indices);
        break;
      default:
        colliderDesc = RAPIER.ColliderDesc.ball(1);
    }

    colliderDesc.setTranslation(offset.x, offset.y, offset.z);
    colliderDesc.setFriction(friction);
    colliderDesc.setRestitution(restitution);
    colliderDesc.setSensor(isSensor);
    colliderDesc.setCollisionGroups(this._interaction(groups, 0xFFFF));

    const collider = this.world.createCollider(colliderDesc, body);
    collider.userData = { bodyId: body.userData?.id, type: config.colliderType || 'generic' };
    return collider;
  }

  raycast(origin, direction, maxDistance = 100, groups = 0xFFFF) {
    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: direction.x, y: direction.y, z: direction.z }
    );

    const filterGroups = this._interaction(0xFFFF, groups);
    const hit = this.world.castRayAndGetNormal(ray, maxDistance, true, undefined, filterGroups);

    if (hit) {
      const distance = hit.timeOfImpact;
      const hitPoint = ray.pointAt(distance);
      const body = hit.collider.parent();
      return {
        point: new THREE.Vector3(hitPoint.x, hitPoint.y, hitPoint.z),
        normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
        distance,
        collider: hit.collider,
        body,
      };
    }

    return null;
  }

  applyImpulse(body, force) {
    if (body) body.applyImpulse(force, true);
  }

  setGravity(x, y, z) {
    this.gravity = { x, y, z };
    this.world.gravity = { x, y, z };
  }

  update(dt) {
    this.world.timestep = Math.min(Math.max(dt, 1 / 240), 1 / 30);
    this.world.step();
  }

  destroy() {
    this.world.free();
  }
}
