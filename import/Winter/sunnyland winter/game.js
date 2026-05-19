/*
 * SunnyLand Winter Demo Code
 * by  @ansimuz
 * Get more free assets and code like these at: www.pixelgameart.org
 * Visit my store for premium content at https://ansimuz.itch.io/
 * March 2019
 * */
var game;
var player;
var gameWidth = 384;
var gameHeight = 224;
var bg_1;
var bg_2;
var bg_3;
var globalMap;
var jumpingFlag;
var crouchFlag = false;
var attackingflag;
var enemies_group;
var projectiles_group;
var shootingFlag;
var nextShot;
var hurtFlag;
var audioHurt;
var music;


window.onload = function() {
  game = new Phaser.Game(gameWidth, gameHeight, Phaser.AUTO, "");
  game.state.add('Boot', boot);
  game.state.add('Preload', preload);
  game.state.add('TitleScreen', titleScreen);
  game.state.add('GameOver', gameOver);
  game.state.add('PlayGame', playGame);
  //
  game.state.start('Boot');
}
var boot = function(game) {}
boot.prototype = {
  preload: function() {
    this.game.load.image('loading', 'assets/sprites/loading.png');
  },
  create: function() {
    game.scale.pageAlignHorizontally = true;
    game.scale.pageAlignVertically = true;
    game.scale.scaleMode = Phaser.ScaleManager.SHOW_ALL;
    game.renderer.renderSession.roundPixels = true;
    this.game.state.start('Preload');
  }
}
var preload = function(game) {};
preload.prototype = {
  preload: function() {
    var loadingBar = this.add.sprite(game.width / 2, game.height / 2, 'loading');
    loadingBar.anchor.setTo(0.5);
    game.load.setPreloadSprite(loadingBar);
    // load title screen
    game.load.image('title', 'assets/sprites/title-screen.png');
    game.load.image('enter', 'assets/sprites/press-enter-text.png');
    game.load.image('credits', 'assets/sprites/credits-text.png');
    game.load.image('instructions', 'assets/sprites/instructions.png');
    game.load.image('game-over', 'assets/sprites/game-over.png');
    // environment
    game.load.image('bg-1', 'assets/environment/bg-1.png');
    game.load.image("bg-2", 'assets/environment/bg-2.png');
    game.load.image("bg-3", 'assets/environment/bg-3.png');
    // tileset
    game.load.image('tileset', 'assets/environment/tileset.png');
    game.load.tilemap('map', 'assets/maps/map.json', null, Phaser.Tilemap.TILED_JSON);
    // atlas sprite
    game.load.atlasJSONArray('atlas', 'assets/atlas/atlas.png', 'assets/atlas/atlas.json');
    // audio
    game.load.audio('music', ['assets/sounds/platformer_level02_loop.ogg']);
    game.load.audio('attack', ['assets/sounds/beam.ogg']);
    game.load.audio('kill', ['assets/sounds/explosion.ogg']);
    game.load.audio('hurt', ['assets/sounds/hurt.ogg']);
  },
  create: function() {
    //this.game.state.start('PlayGame');
    this.game.state.start('TitleScreen');
  }
}
var titleScreen = function(game) {};
titleScreen.prototype = {
  create: function() {
    bg_1 = game.add.tileSprite(0, 0, gameWidth, gameHeight, 'bg-1');
    bg_2 = game.add.tileSprite(0, 0, gameWidth, gameHeight, 'bg-2');
    this.title = game.add.image(gameWidth / 2, 100, 'title');
    this.title.anchor.setTo(0.5);
    var credits = game.add.image(gameWidth / 2, game.height - 12, 'credits');
    credits.anchor.setTo(0.5);
    this.pressEnter = game.add.image(game.width / 2, game.height - 60, 'enter');
    this.pressEnter.anchor.setTo(0.5);
    game.time.events.loop(700, this.blinkText, this);
    var startKey = game.input.keyboard.addKey(Phaser.Keyboard.ENTER);
    startKey.onDown.add(this.startGame, this);
    this.state = 1;
  },
  blinkText: function() {
    if (this.pressEnter.alpha) {
      this.pressEnter.alpha = 0;
    } else {
      this.pressEnter.alpha = 1;
    }
  },
  update: function() {
    bg_2.tilePosition.x -= 0.2;
  },
  startGame: function() {
    if (this.state == 1) {
      this.state = 2;
      this.title2 = game.add.image(game.width / 2, 40, 'instructions');
      this.title2.anchor.setTo(0.5, 0);
      this.title.destroy();
    } else {
      this.game.state.start('PlayGame');
    }
  }
}

var gameOver = function(game) {};
gameOver.prototype = {
  create: function() {
    bg_1 = game.add.tileSprite(0, 0, gameWidth, gameHeight, 'bg-1');
    bg_2 = game.add.tileSprite(0, 0, gameWidth, gameHeight, 'bg-2');
    this.title = game.add.image(game.width / 2, 90, 'game-over');
    this.title.anchor.setTo(0.5);
    var credits = game.add.image(gameWidth / 2, game.height - 12, 'credits');
    credits.anchor.setTo(0.5);
    this.pressEnter = game.add.image(game.width / 2, game.height - 60, 'enter');
    this.pressEnter.anchor.setTo(0.5);
    game.time.events.loop(700, this.blinkText, this);
    var startKey = game.input.keyboard.addKey(Phaser.Keyboard.ENTER);
    startKey.onDown.add(this.startGame, this);
    this.state = 2;
  },
  blinkText: function() {
    if (this.pressEnter.alpha) {
      this.pressEnter.alpha = 0;
    } else {
      this.pressEnter.alpha = 1;
    }
  },
  update: function() {
    bg_2.tilePosition.x -= 0.2;
  },
  startGame: function() {
    if (this.state == 1) {
      this.state = 2;
      this.title2 = game.add.image(game.width / 2, 40, 'game-over');
      this.title2.anchor.setTo(0.5, 0);
      this.title.destroy();
    } else {
      this.game.state.start('PlayGame');
    }
  }
}


var playGame = function(game) {};
playGame.prototype = {
  create: function() {

    this.createBackgrounds();
    this.createTileMap();
    this.bindKeys();
    this.createPlayer(3, 8);
    //   // camera follow
    game.camera.follow(player, Phaser.Camera.FOLLOW_PLATFORMER);
    this.createGroups();
    this.populate();
    //
    this.startAudios();
  },




  startAudios: function() {
    // audios
    this.audioKill = game.add.audio("kill");
    this.audioAttack = game.add.audio("attack");
    audioHurt = game.add.audio("hurt");

    // music
    music = game.add.audio('music');
    music.loop = true;
    music.play();
  },

  createGroups: function() {
    // projectiles groups
    projectiles_group = game.add.group();
    projectiles_group.enableBody = true;
    //enemies group
    enemies_group = game.add.group();
    enemies_group.enableBody = true;
  },
  populate: function() {

    //Yetis
    this.addYeti(25, 10);

    //Foxes
    this.addFox(75, 11);
      this.addFox(108, 5);

    // Owls
    this.addOwl(32,7);
    this.addOwl(55,6);
    this.addOwl(98,2);

  },
  shoot: function() {
    if (nextShot > game.time.now) {
      return;
    }
    nextShot = game.time.now + 600;
    var shot = new Shot(game, player.x, player.y + 4, player.scale.x);
    projectiles_group.add(shot);
    this.audioAttack.play();
    shootingFlag = true;
    player.animations.play("shot");
  },

  addYeti: function(x, y) {
    var temp = new Yeti(game, x, y);
    game.add.existing(temp);
    enemies_group.add(temp);
  },

  addFox: function(x, y) {
    var temp = new Fox(game, x, y);
    game.add.existing(temp);
    enemies_group.add(temp);
  },

  addOwl: function(x, y) {
    var temp = new Owl(game, x, y);
    game.add.existing(temp);
    enemies_group.add(temp);
  },


  bindKeys: function() {
    this.wasd = {
      jump: game.input.keyboard.addKey(Phaser.Keyboard.X),
      attack2: game.input.keyboard.addKey(Phaser.Keyboard.K),
      attack: game.input.keyboard.addKey(Phaser.Keyboard.C),

      left: game.input.keyboard.addKey(Phaser.Keyboard.LEFT),
      right: game.input.keyboard.addKey(Phaser.Keyboard.RIGHT),
      crouch: game.input.keyboard.addKey(Phaser.Keyboard.DOWN),
      up: game.input.keyboard.addKey(Phaser.Keyboard.UP),
    }
    game.input.keyboard.addKeyCapture(
      [Phaser.Keyboard.C,
        Phaser.Keyboard.LEFT,
        Phaser.Keyboard.RIGHT,
        Phaser.Keyboard.DOWN,
        Phaser.Keyboard.X
      ]
    );
  },
  createPlayer: function(x, y) {
    var temp = new Player(game, x, y);
    game.add.existing(temp);
  },

  createBackgrounds: function() {
    bg_1 = game.add.tileSprite(0, 0, gameWidth, gameHeight, 'bg-1');
    bg_2 = game.add.tileSprite(0, 0, gameWidth, gameHeight, 'bg-2');
    bg_3 = game.add.tileSprite(0, 0, gameWidth, gameHeight, 'bg-3');
    //
    bg_1.fixedToCamera = true;
    bg_2.fixedToCamera = true;
    bg_3.fixedToCamera = true;
  },
  createTileMap: function() {
    // tiles
    globalMap = game.add.tilemap('map');
    globalMap.addTilesetImage('tileset');

    this.layer_back = globalMap.createLayer('Back Layer');
    this.layer_back.resizeWorld();
    //
    this.layer = globalMap.createLayer('Main Layer');
    this.layer.resizeWorld();
    //
    this.layer_front = globalMap.createLayer('Front Layer');
    this.layer_front.resizeWorld();
    //

    //
    //
    this.layer_collisions = globalMap.createLayer("Collisions Layer");
    this.layer_collisions.resizeWorld();
    // collisions
    globalMap.setCollision([1]);
    this.layer_collisions.visible = false;
    this.layer_collisions.debug = false;
    // one way collisions
    this.setTopCollisionTiles(2);


  },
  setTopCollisionTiles: function(tileIndex) {
    var x, y, tile;
    for (x = 0; x < globalMap.width; x++) {
      for (y = 1; y < globalMap.height; y++) {
        tile = globalMap.getTile(x, y);
        if (tile !== null) {
          if (tile.index == tileIndex) {
            tile.setCollision(false, false, true, false);
          }
        }
      }
    }
  },


  update: function() {


    // //physics
    game.physics.arcade.collide(player, this.layer_collisions);
    game.physics.arcade.collide(enemies_group, this.layer_collisions);
    game.physics.arcade.collide(projectiles_group, this.layer_collisions, this.hitWall, null, this);
    // //  //overlaps
    game.physics.arcade.overlap(enemies_group, projectiles_group, this.hitEnemy, null, this);
    game.physics.arcade.overlap(player, enemies_group, this.hurtPlayer, null, this);
    this.hurtFlagManager();
    this.movePlayer();
    this.parallaxBackground();
    // //
    // //
    // // if end is reached display game over screen
   if (player.position.x > this.world.width - 50) {
       this.game.state.start('TitleScreen');
       music.stop();
     }
    //
    //
    // // death form falling
    if (player.position.y > this.world.height + 100) {
       player.x = 2 * 16;
       player.y = 5 * 16;
     }
    //
    //
    //
    this.playerAnimations();
    this.debugGame();

  },


  hitEnemy: function(enemy, shot) {
    var impact = new ShotImpact(game, shot.x, shot.y, shot.scale.x);
    game.add.existing(impact);

    var death = new EnemyDeath(game, enemy.x, enemy.y);
    game.add.existing(death);
    shot.kill();
    enemy.kill();
    this.audioKill.play();

  },
  hitWall: function(shot, wall) {

    var dir = (shot.scale.x == 1) ? 20 : -20;
    var impact = new ShotImpact(game, shot.x + dir, shot.y, shot.scale.x);
    game.add.existing(impact);
    shot.kill();
  },
  playerAnimations: function() {
    if (hurtFlag || shootingFlag) {
      return;
    }

    if (jumpingFlag) {
      if (player.body.velocity.y > 0) {
        player.animations.play("fall");
      }
      return;
    }


    if (player.body.onFloor()) {
      if (player.body.velocity.x != 0) {
        if (shootingFlag) {
          player.animations.play("run-shoot");
        } else {
          player.animations.play("run");
        }
      } else {
        if (this.wasd.crouch.isDown) {
          player.animations.play("duck");
          isDuck = true;
        } else {
          player.animations.play("idle");
          isDuck = false;
          if (shootingFlag) {
            player.animations.play("shoot")
          } else {
            player.animations.play("idle");
          }
        }
      }
    } else {

    }
  },

  hurtPlayer: function() {
    if (hurtFlag) {
      return;
    }
    hurtFlag = true;
    player.animations.play('hurt');
    player.body.velocity.y = -100;
    player.body.velocity.x = (player.scale.x == 1) ? -60 : 60;
    audioHurt.play();
  },
  hurtFlagManager: function() {
    // reset hurt when touching ground
    if (hurtFlag && player.body.onFloor()) {
      hurtFlag = false;
    }
  },

  debugGame: function() {

    //  game.debug.body(player);
    //enemies_group.forEachAlive(this.renderGroup, this);
    //projectiles_group.forEachAlive(this.renderGroup, this);
  },
  parallaxBackground: function() {
    bg_2.tilePosition.x = this.layer.x * -.08;
    bg_3.tilePosition.x = this.layer.x * -.5;
  },
  movePlayer: function() {
    if (hurtFlag) {
      return;
    }

    if (shootingFlag) {
      player.body.velocity.x = 0;
      return;
    }

    if (hurtFlag) {
      return;
    }

    var vel = 100;

    //horizontal

    if (this.wasd.left.isDown) {

    } else {
      player.body.velocity.x = 0;

    }

    // reset jumpingflag
    if (player.body.onFloor()) {
      jumpingFlag = false;
    }


    if (this.wasd.left.isDown) {
      player.body.velocity.x = -vel;

      player.scale.x = -1;
    } else if (this.wasd.right.isDown) {
      player.body.velocity.x = vel;

      player.scale.x = 1;
    } else {
      player.body.velocity.x = 0;
      if (this.wasd.crouch.isDown) {

        if (!crouchFlag) {
          player.animations.play('crouch');
          crouchFlag = true;
        }
      }

    }
    // reset crouch state
    if (this.wasd.crouch.isUp) {
      crouchFlag = false;
    }
    // jump
    if (this.wasd.jump.isDown && player.body.onFloor()) {
      player.body.velocity.y = -170;
      player.animations.play('jump');
      jumpingFlag = true;
    }
    //shooting
    if (this.wasd.attack.isDown || this.wasd.attack2.isDown) {
      this.shoot();
    }
  },
  renderGroup: function(member) {
    game.debug.body(member);
  }
}
// player entity
Player = function(game, x, y) {
  kind = "player";
  x *= 16;
  y *= 16;
  this.initX = x;
  this.initY = y;
  Phaser.Sprite.call(this, game, x, y, "atlas", "idle-1");
  this.anchor.setTo(0.5);
  game.physics.arcade.enable(this);
  this.body.setSize(11, 19, 21, 26);
  this.body.gravity.y = 400;
  this.kind = "player";
  player = this;
  // add animations
  var animVel = 12;
  this.animations.add('idle', Phaser.Animation.generateFrameNames('idle-', 1, 4, '', 0), animVel - 4, true);
  this.animations.add('run', Phaser.Animation.generateFrameNames('run-', 1, 8, '', 0), animVel - 0, true);

  this.animations.add('jump', ['jump-1', 'jump-1', 'jump-1', 'jump-2', 'jump-3', 'jump-2', 'jump-3', 'jump-2', 'jump-3'], animVel, true);
  this.animations.add('fall', ['jump-4', 'jump-5'], animVel, true);
  this.animations.add('crouch', Phaser.Animation.generateFrameNames('crouch-', 1, 3, '', 0), animVel - 4, true);
  var animShot = this.animations.add('shot', Phaser.Animation.generateFrameNames('shot-', 1, 4, '', 0), animVel - 4, false);
  animShot.onComplete.add(function() {
    shootingFlag = false;
    console.log("sotp fire");
  }, this);
  this.animations.add('hurt', Phaser.Animation.generateFrameNames('hurt-', 1, 2, '', 0), animVel - 0, true);
  this.animations.play('idle');
}
Player.prototype = Object.create(Phaser.Sprite.prototype);
Player.prototype.constructor = Player;
Player.prototype.update = function() {


}
// enemies

// Yeti
Yeti = function(game, x, y) {
  x *= 16;
  y *= 16;
  this.xDir = -1;
  this.speed = 20;
  this.turnTimerTrigger = 110;
  this.turnTimer = this.turnTimerTrigger;
  Phaser.Sprite.call(this, game, x, y, 'atlas', 'yeti-1');
  game.physics.arcade.enable(this);
  this.body.gravity.y = 400;
  this.body.setSize(14, 24, 11, 9);
  this.anchor.setTo(0.5);
  this.animations.add('yeti', Phaser.Animation.generateFrameNames('yeti-', 1, 8, '', 0), 8, true);
  this.animations.play('yeti');
};
Yeti.prototype = Object.create(Phaser.Sprite.prototype);
Yeti.prototype.constructor = Yeti;
Yeti.prototype.update = function() {
  this.body.velocity.x = this.speed * this.xDir;
  // turn around
  if (this.turnTimer <= 0) {
    this.xDir *= -1;
    this.turnTimer = this.turnTimerTrigger;
  } else {
    this.turnTimer--;
  }
  this.scale.x = this.xDir;
};

// Fox
Fox = function(game, x, y) {
  x *= 16;
  y *= 16;
  this.xDir = -1;
  this.speed = 80;
  this.turnTimerTrigger = 210;
  this.turnTimer = this.turnTimerTrigger;
  Phaser.Sprite.call(this, game, x, y, 'atlas', 'fox-1');
  game.physics.arcade.enable(this);
  this.body.gravity.y = 400;
  this.body.setSize(40, 21, 19, 15);
  this.anchor.setTo(0.5);
  this.animations.add('fox', Phaser.Animation.generateFrameNames('fox-', 1, 6, '', 0), 14, true);
  this.animations.play('fox');
};
Fox.prototype = Object.create(Phaser.Sprite.prototype);
Fox.prototype.constructor = Yeti;
Fox.prototype.update = function() {
  this.body.velocity.x = this.speed * this.xDir;
  // turn around
  if (this.turnTimer <= 0) {
    this.xDir *= -1;
    this.turnTimer = this.turnTimerTrigger;
  } else {
    this.turnTimer--;
  }
  this.scale.x = this.xDir;
};


// Owl
Owl = function(game, x, y) {
  x *= 16;
  y *= 16;
  this.yDir = -1;
  this.speed = 10;
  this.turnTimerTrigger = 210;
  this.turnTimer = this.turnTimerTrigger;
  Phaser.Sprite.call(this, game, x, y, 'atlas', 'owl-1');
  game.physics.arcade.enable(this);
  this.body.setSize(13, 23, 24, 17);
  this.anchor.setTo(0.5);
  this.animations.add('fox', Phaser.Animation.generateFrameNames('owl-', 1, 6, '', 0), 18, true);
  this.animations.play('fox');
};
Owl.prototype = Object.create(Phaser.Sprite.prototype);
Owl.prototype.constructor = Owl;
Owl.prototype.update = function() {
  this.body.velocity.y = this.speed * this.yDir;

  // up and down
  if (this.turnTimer <= 0) {
    this.turnTimer = this.turnTimerTrigger;
    this.yDir *= -1;
  } else {
    this.turnTimer--;
  }

if(  player.x < this.x){
    this.scale.x = 1;
}else{
  this.scale.x = -1;
}


};





// shot

Shot = function(game, x, y, dir) {
  y = (crouchFlag) ? y - 8 : y - 8;
  x += (dir == 1) ? 0 : -0;


  Phaser.Sprite.call(this, game, x, y, "atlas", "fireball-1");
  this.animations.add("fireball", Phaser.Animation.generateFrameNames("fireball-", 1, 4, '', 0), 20, true);
  this.animations.play("fireball");
  game.physics.arcade.enable(this);
  this.body.velocity.x = 170 * dir;
  this.checkWorldBounds = true;

  this.scale.x = dir;
}
Shot.prototype = Object.create(Phaser.Sprite.prototype);
Shot.prototype.constructor = Shot;
Shot.prototype.update = function() {
  if (!this.inWorld) {
    this.destroy();
  }
}

// shot impact
ShotImpact = function(game, x, y, scale) {
  Phaser.Sprite.call(this, game, x, y, "atlas", "fireball-hit-1");
  var anim = this.animations.add('impact', Phaser.Animation.generateFrameNames('fireball-hit-', 1, 6, '', 0), 18, false);
  this.animations.play('impact');
  anim.onComplete.add(function() {
    this.kill();
  }, this);
  this.scale.x = scale;
}
ShotImpact.prototype = Object.create(Phaser.Sprite.prototype);
ShotImpact.prototype.constructor = ShotImpact;



// Misc
EnemyDeath = function(game, x, y) {
  Phaser.Sprite.call(this, game, x, y, 'atlas', 'enemy-death-1');
  this.anchor.setTo(0.5);
  var anim = this.animations.add('death', Phaser.Animation.generateFrameNames('enemy-death-', 1, 7, '', 0), 16, false);
  this.animations.play('death');
  anim.onComplete.add(function() {
    this.destroy();
  }, this);
};
EnemyDeath.prototype = Object.create(Phaser.Sprite.prototype);
EnemyDeath.prototype.constructor = EnemyDeath;
