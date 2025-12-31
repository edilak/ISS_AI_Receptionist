/**
 * AI-Powered Natural Language Instruction Generator
 * 
 * Generates clear, human-readable navigation instructions
 * with landmark references and accessibility considerations.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

class InstructionGenerator {
  constructor(options = {}) {
    this.options = {
      language: 'en',
      verbose: false,
      includeEstimatedTime: true,
      includeLandmarks: true,
      accessibilityMode: false,
      ...options
    };

    // Initialize AI
    this.genAI = null;
    this.model = null;
    
    if (process.env.GOOGLE_API_KEY) {
      try {
        this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        console.log('🤖 InstructionGenerator AI initialized');
      } catch (error) {
        console.warn('⚠️ AI initialization failed, using rule-based generation');
      }
    }

    // Direction translations
    this.directions = {
      en: {
        north: 'north',
        south: 'south',
        east: 'right',
        west: 'left',
        northeast: 'diagonally right',
        northwest: 'diagonally left',
        southeast: 'diagonally right',
        southwest: 'diagonally left',
        forward: 'straight ahead',
        turnLeft: 'turn left',
        turnRight: 'turn right',
        continue: 'continue',
        arrive: 'arrive at',
        takeElevator: 'take the elevator',
        takeStairs: 'take the stairs',
        walk: 'walk',
        proceed: 'proceed',
        towards: 'towards',
        past: 'past',
        until: 'until you reach'
      },
      'zh-HK': {
        north: '向北',
        south: '向南',
        east: '向右',
        west: '向左',
        northeast: '右斜前方',
        northwest: '左斜前方',
        southeast: '右斜前方',
        southwest: '左斜前方',
        forward: '直行',
        turnLeft: '左轉',
        turnRight: '右轉',
        continue: '繼續',
        arrive: '到達',
        takeElevator: '搭升降機',
        takeStairs: '行樓梯',
        walk: '步行',
        proceed: '前進',
        towards: '向',
        past: '經過',
        until: '直到'
      },
      'zh-CN': {
        north: '向北',
        south: '向南',
        east: '向右',
        west: '向左',
        northeast: '右斜前方',
        northwest: '左斜前方',
        southeast: '右斜前方',
        southwest: '左斜前方',
        forward: '直行',
        turnLeft: '左转',
        turnRight: '右转',
        continue: '继续',
        arrive: '到达',
        takeElevator: '乘电梯',
        takeStairs: '走楼梯',
        walk: '步行',
        proceed: '前进',
        towards: '向',
        past: '经过',
        until: '直到'
      }
    };

    // Location type friendly names
    this.typeNames = {
      en: {
        zone: 'Zone',
        corridor: 'Corridor',
        elevator: 'Lift Lobby',
        stairs: 'Staircase',
        entrance: 'Main Entrance',
        reception: 'Reception',
        lobby: 'Lobby',
        facility: 'Facility'
      },
      'zh-HK': {
        zone: '區域',
        corridor: '走廊',
        elevator: '升降機大堂',
        stairs: '樓梯',
        entrance: '主入口',
        reception: '接待處',
        lobby: '大堂',
        facility: '設施'
      },
      'zh-CN': {
        zone: '区域',
        corridor: '走廊',
        elevator: '电梯大厅',
        stairs: '楼梯',
        entrance: '主入口',
        reception: '接待处',
        lobby: '大厅',
        facility: '设施'
      }
    };
  }

  /**
   * Generate natural language instructions for a path
   */
  async generateInstructions(path, context, options = {}) {
    const opts = { ...this.options, ...options };
    const lang = opts.language;

    if (path.length === 0) {
      return this.getEmptyPathMessage(lang);
    }

    if (path.length === 1) {
      return this.getSameLocationMessage(path[0], lang);
    }

    // Try AI-generated instructions first
    if (this.model && !opts.forceRuleBased) {
      try {
        const aiInstructions = await this.generateAIInstructions(path, context, opts);
        if (aiInstructions) {
          return aiInstructions;
        }
      } catch (error) {
        console.warn('AI instruction generation failed, falling back to rule-based:', error.message);
      }
    }

    // Fall back to rule-based generation
    return this.generateRuleBasedInstructions(path, context, opts);
  }

  /**
   * Generate AI-powered instructions using Gemini
   */
  async generateAIInstructions(path, context, opts) {
    const lang = opts.language;
    const langName = lang === 'en' ? 'English' : lang === 'zh-HK' ? 'Traditional Chinese (Cantonese)' : 'Simplified Chinese (Mandarin)';
    
    // Build path description for AI
    const pathDescription = path.map((node, idx) => {
      const floorLabel = node.floor === 0 ? 'G/F' : `${node.floor}/F`;
      return `${idx + 1}. ${this.formatNodeName(node.name, lang)} (${floorLabel}, type: ${node.type})${node.floorChange ? ' [FLOOR CHANGE]' : ''}`;
    }).join('\n');

    const contextInfo = `
- Total distance: approximately ${context.totalDistance} meters
- Estimated walking time: ${Math.ceil(context.estimatedTime / 60)} minutes
- Floor changes: ${context.floorChanges.length}
- Number of turns: ${context.turns}
`;

    const prompt = `You are a helpful building wayfinding assistant. Generate clear, concise navigation instructions in ${langName}.

PATH TO NAVIGATE:
${pathDescription}

NAVIGATION CONTEXT:
${contextInfo}

REQUIREMENTS:
1. Write in ${langName}
2. Use friendly, conversational tone
3. Reference landmarks when helpful
4. Include floor changes clearly
5. Give turn-by-turn directions
6. Be concise but complete
7. Number each step
8. End with confirmation of arrival
${opts.accessibilityMode ? '9. This is for accessibility mode - emphasize elevator use over stairs' : ''}

Generate the navigation instructions now:`;

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return {
      type: 'ai-generated',
      language: lang,
      instructions: text,
      summary: this.generateSummary(path, context, lang),
      steps: this.parseAISteps(text, path),
      estimatedTime: context.estimatedTime,
      totalDistance: context.totalDistance,
      floorChanges: context.floorChanges.length
    };
  }

  /**
   * Parse AI-generated text into structured steps
   */
  parseAISteps(text, path) {
    const lines = text.split('\n').filter(line => line.trim());
    const steps = [];
    
    lines.forEach((line, idx) => {
      // Look for numbered steps
      const match = line.match(/^(\d+)[.)]\s*(.+)/);
      if (match) {
        const stepNumber = parseInt(match[1]);
        const instruction = match[2].trim();
        const correspondingNode = path[Math.min(stepNumber - 1, path.length - 1)];
        
        steps.push({
          stepNumber,
          instruction,
          nodeId: correspondingNode?.id || null,
          nodeName: correspondingNode?.name || null,
          floor: correspondingNode?.floor ?? null,
          isFloorChange: correspondingNode?.floorChange || false
        });
      }
    });

    // If no numbered steps found, create basic steps from path
    if (steps.length === 0) {
      path.forEach((node, idx) => {
        steps.push({
          stepNumber: idx + 1,
          instruction: `Go to ${this.formatNodeName(node.name, 'en')}`,
          nodeId: node.id,
          nodeName: node.name,
          floor: node.floor,
          isFloorChange: node.floorChange || false
        });
      });
    }

    return steps;
  }

  /**
   * Generate rule-based instructions (fallback)
   */
  generateRuleBasedInstructions(path, context, opts) {
    const lang = opts.language;
    const dict = this.directions[lang] || this.directions.en;
    const steps = [];
    
    let prevDirection = null;

    for (let i = 0; i < path.length; i++) {
      const current = path[i];
      const next = path[i + 1];
      const prev = path[i - 1];

      let instruction = '';
      const floorLabel = current.floor === 0 ? 'G/F' : `${current.floor}/F`;
      const nodeName = this.formatNodeName(current.name, lang);

      // Starting point
      if (i === 0) {
        instruction = this.formatStartInstruction(nodeName, floorLabel, lang);
      }
      // Floor change
      else if (current.floorChange || (prev && current.floor !== prev.floor)) {
        const method = current.type === 'elevator' ? dict.takeElevator : dict.takeStairs;
        const fromFloor = prev?.floor === 0 ? 'G/F' : `${prev?.floor}/F`;
        instruction = this.formatFloorChangeInstruction(method, fromFloor, floorLabel, nodeName, lang);
      }
      // Destination
      else if (i === path.length - 1) {
        instruction = this.formatArrivalInstruction(nodeName, floorLabel, lang);
      }
      // Intermediate step
      else if (next) {
        const direction = this.calculateDirection(current, next);
        const turnInstruction = this.getTurnInstruction(prevDirection, direction, dict);
        instruction = this.formatWalkInstruction(turnInstruction, nodeName, lang);
        prevDirection = direction;
      }

      if (instruction) {
        steps.push({
          stepNumber: steps.length + 1,
          instruction,
          nodeId: current.id,
          nodeName: current.name,
          floor: current.floor,
          isFloorChange: current.floorChange || false,
          icon: this.getStepIcon(current, i, path.length)
        });
      }
    }

    return {
      type: 'rule-based',
      language: lang,
      instructions: steps.map(s => s.instruction).join('\n'),
      summary: this.generateSummary(path, context, lang),
      steps,
      estimatedTime: context.estimatedTime,
      totalDistance: context.totalDistance,
      floorChanges: context.floorChanges.length
    };
  }

  /**
   * Format helper functions for different languages
   */
  formatStartInstruction(nodeName, floor, lang) {
    switch (lang) {
      case 'zh-HK':
        return `從 ${nodeName} (${floor}) 開始`;
      case 'zh-CN':
        return `从 ${nodeName} (${floor}) 开始`;
      default:
        return `Start from ${nodeName} (${floor})`;
    }
  }

  formatFloorChangeInstruction(method, fromFloor, toFloor, nodeName, lang) {
    switch (lang) {
      case 'zh-HK':
        return `${method}從 ${fromFloor} 到 ${toFloor}，到達 ${nodeName}`;
      case 'zh-CN':
        return `${method}从 ${fromFloor} 到 ${toFloor}，到达 ${nodeName}`;
      default:
        return `${method} from ${fromFloor} to ${toFloor}, arriving at ${nodeName}`;
    }
  }

  formatArrivalInstruction(nodeName, floor, lang) {
    switch (lang) {
      case 'zh-HK':
        return `到達目的地：${nodeName} (${floor})`;
      case 'zh-CN':
        return `到达目的地：${nodeName} (${floor})`;
      default:
        return `Arrive at your destination: ${nodeName} (${floor})`;
    }
  }

  formatWalkInstruction(turnInstruction, nodeName, lang) {
    switch (lang) {
      case 'zh-HK':
        return `${turnInstruction}，前往 ${nodeName}`;
      case 'zh-CN':
        return `${turnInstruction}，前往 ${nodeName}`;
      default:
        return `${turnInstruction} towards ${nodeName}`;
    }
  }

  /**
   * Calculate direction between two nodes
   */
  calculateDirection(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    if (angle >= -45 && angle < 45) return 'east';
    if (angle >= 45 && angle < 135) return 'south';
    if (angle >= 135 || angle < -135) return 'west';
    return 'north';
  }

  /**
   * Get turn instruction based on direction change
   */
  getTurnInstruction(prevDir, currentDir, dict) {
    if (!prevDir) return dict.proceed;

    const directionOrder = ['north', 'east', 'south', 'west'];
    const prevIdx = directionOrder.indexOf(prevDir);
    const currIdx = directionOrder.indexOf(currentDir);

    if (prevIdx === -1 || currIdx === -1) return dict.continue;

    const diff = (currIdx - prevIdx + 4) % 4;

    if (diff === 0) return dict.continue;
    if (diff === 1) return dict.turnRight;
    if (diff === 3) return dict.turnLeft;
    return dict.continue; // 180 degree turn
  }

  /**
   * Get icon for step type
   */
  getStepIcon(node, stepIndex, totalSteps) {
    if (stepIndex === 0) return '🚩';
    if (stepIndex === totalSteps - 1) return '🎯';
    if (node.type === 'elevator') return '🛗';
    if (node.type === 'stairs') return '🪜';
    if (node.type === 'corridor') return '🚶';
    if (node.type === 'facility') return '🚻';
    return '📍';
  }

  /**
   * Generate summary of the route
   */
  generateSummary(path, context, lang) {
    const start = this.formatNodeName(path[0]?.name || 'Start', lang);
    const end = this.formatNodeName(path[path.length - 1]?.name || 'End', lang);
    const minutes = Math.ceil(context.estimatedTime / 60);
    const floors = context.floorChanges.length;

    switch (lang) {
      case 'zh-HK':
        return `從 ${start} 到 ${end}，約 ${minutes} 分鐘，${floors > 0 ? `需要轉換 ${floors} 層` : '同一層'}`;
      case 'zh-CN':
        return `从 ${start} 到 ${end}，约 ${minutes} 分钟，${floors > 0 ? `需要换 ${floors} 层` : '同一层'}`;
      default:
        return `From ${start} to ${end}, approximately ${minutes} minute${minutes > 1 ? 's' : ''}, ${floors > 0 ? `${floors} floor change${floors > 1 ? 's' : ''}` : 'same floor'}`;
    }
  }

  /**
   * Format node name for display
   */
  formatNodeName(name, lang) {
    if (!name) return '';
    
    // Handle HSITP prefixed names
    let displayName = name.replace(/^hsitp_/i, '').replace(/_/g, ' ');
    
    // Capitalize words
    displayName = displayName.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    // Handle zone numbers
    displayName = displayName.replace(/zone (\d+)/i, 'Zone $1');
    
    // Handle floor indicators
    displayName = displayName.replace(/ (\d)$/, ' ($1/F)');

    return displayName;
  }

  /**
   * Get message for empty path
   */
  getEmptyPathMessage(lang) {
    switch (lang) {
      case 'zh-HK':
        return { instructions: '無法找到路徑', steps: [] };
      case 'zh-CN':
        return { instructions: '无法找到路径', steps: [] };
      default:
        return { instructions: 'Unable to find a path', steps: [] };
    }
  }

  /**
   * Get message when already at destination
   */
  getSameLocationMessage(node, lang) {
    const name = this.formatNodeName(node.name, lang);
    switch (lang) {
      case 'zh-HK':
        return { instructions: `你已經在 ${name}`, steps: [] };
      case 'zh-CN':
        return { instructions: `你已经在 ${name}`, steps: [] };
      default:
        return { instructions: `You are already at ${name}`, steps: [] };
    }
  }
}

module.exports = InstructionGenerator;

