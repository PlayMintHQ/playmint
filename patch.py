import sys

with open('src/game/GameManagerScene.js', 'r') as f:
    lines = f.readlines()

new_lines = []
inside_hit_obstacle = False
for i, line in enumerate(lines):
    if line.strip() == 'hitObstacle(player, obstacle) {':
        new_lines.append(line)
        inside_hit_obstacle = True
    elif inside_hit_obstacle and 'console.error(`[BOOT#${this._bootId}] hitObstacle TRIGGERED!`,' in line:
        new_lines.append(line)
        new_lines.append('      `player: x=${player?.x?.toFixed(1)} y=${player?.y?.toFixed(1)}`,\n')
        new_lines.append('      `playerBody: w=${player?.body?.width} h=${player?.body?.height}`,\n')
        new_lines.append('      `playerBounds: top=${player?.body?.top?.toFixed(1)} bottom=${player?.body?.bottom?.toFixed(1)} left=${player?.body?.left?.toFixed(1)} right=${player?.body?.right?.toFixed(1)}`,\n')
        new_lines.append('      `obstacle: x=${obstacle?.x?.toFixed(1)} y=${obstacle?.y?.toFixed(1)}`,\n')
        new_lines.append('      `obstacleBounds: top=${obstacle?.body?.top?.toFixed(1)} bottom=${obstacle?.body?.bottom?.toFixed(1)} left=${obstacle?.body?.left?.toFixed(1)} right=${obstacle?.body?.right?.toFixed(1)}`\n')
        new_lines.append('    );\n')
    elif inside_hit_obstacle and 'obstacleBounds: top=' in line:
        pass
    elif inside_hit_obstacle and 'playerBounds: top=' in line:
        pass
    elif inside_hit_obstacle and 'obstacle: x=' in line:
        pass
    elif inside_hit_obstacle and 'playerBody: w=' in line:
        pass
    elif inside_hit_obstacle and 'player: x=' in line:
        pass
    elif inside_hit_obstacle and ');' in line and 'obstacleBounds' in lines[i-1]:
        pass
    elif line.strip() == 'this.events.on(\'shutdown\', () => {':
        new_lines.append('    const cleanupScene = () => {\n')
        new_lines.append('      if (this._cleanedUp) return;\n')
        new_lines.append('      this._cleanedUp = true;\n')
    elif line.strip() == '});' and lines[i-1].strip() == '}':
        if 'this.gameModeManager.cleanup();' in ''.join(lines[i-4:i+1]):
            new_lines.append('    };\n')
            new_lines.append('    this.events.on(\'shutdown\', cleanupScene);\n')
            new_lines.append('    this.events.on(\'destroy\', cleanupScene);\n')
        else:
            new_lines.append(line)
    else:
        new_lines.append(line)

with open('src/game/GameManagerScene.js', 'w') as f:
    f.writelines(new_lines)
