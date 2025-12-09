let audioContext;
let analyser;
let microphone;
let javascriptNode;
let isRunning = false;
let baseFrequency = 100; // 基准频率
let maxFrequency = 500;  // 最大频率
let DEBUG = false;

const freqSpan = document.getElementById('freq');
const birdElement = document.getElementById('bird');
const container = document.getElementById('game-container');

// 获取游戏相关元素
const scoreElement = document.getElementById('score');
const gameOverElement = document.getElementById('game-over');
const finalScoreElement = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const body = document.body;
const freqIndicator = document.getElementById('freq-indicator');

// 游戏状态变量
let birdPosition = 300;
let birdVelocity = 0;
let gameRunning = false;
let score = 0;
let pipes = [];
let lastPipeTime = 0;
let gameSpeed = 3;
let animationId;
let currentFrequency = 0;
let gameStarted = false;
let gravity = -0.05;
let startTime = 0;


document.addEventListener('DOMContentLoaded', async () => {
    if (isRunning) return;

    try {
        // 获取麦克风流
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

        // 初始化 AudioContext（兼容不同浏览器）
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        javascriptNode = audioContext.createScriptProcessor(4096, 1, 1);

        // 设置参数
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.0;

        // 连接节点
        microphone.connect(analyser);
        analyser.connect(javascriptNode);
        javascriptNode.connect(audioContext.destination);

        // 处理音频数据
        javascriptNode.onaudioprocess = function () {
            const bufferLength = analyser.fftSize;
            const dataArray = new Float32Array(bufferLength);
            analyser.getFloatTimeDomainData(dataArray);

            // 使用自相关算法估算基频
            const sampleRate = audioContext.sampleRate;
            let fundamentalFreq = estimateFundamentalFreq(dataArray, sampleRate);
            const debugVal = document.getElementById('debug-freq').value;

            if (DEBUG) {
                fundamentalFreq = debugVal;
            }

            if (fundamentalFreq > 0) {
                currentFrequency = fundamentalFreq;
                freqSpan.innerText = `${fundamentalFreq.toFixed(1)} Hz`;
            } else {
                // 如果自相关方法失败，尝试使用频域方法
                const frequency = estimateFrequencyFromSpectrum(analyser);
                if (frequency > 0) {
                    currentFrequency = frequency;
                    freqSpan.innerText = `${frequency.toFixed(1)} Hz`;
                } else {
                    currentFrequency = debugVal;
                    freqSpan.innerText = debugVal + ` Hz`;
                }
            }
        };

        isRunning = true;
        
        // 设置按钮事件
        startBtn.addEventListener('click', startGame);
        restartBtn.addEventListener('click', restartGame);
        
    } catch (err) {
        console.error('无法获取麦克风权限:', err);
        alert('无法访问麦克风，请确保允许权限并在安全上下文中运行（HTTPS 或 localhost）');
    }
});

// 开始游戏
function startGame() {
    startScreen.style.display = 'none';
    gameStarted = true;
    gameRunning = true;
    score = 0;
    birdPosition = 300;
    birdVelocity = 0;
    pipes = [];
    gameSpeed = 3;
    startTime = Date.now();
    
    scoreElement.textContent = score;
    gameOverElement.style.display = 'none';
    document.querySelectorAll('.pipe').forEach(p => p.remove());
    
    lastPipeTime = Date.now();
    gameLoop();
}

// 重新开始游戏
function restartGame() {
    gameOverElement.style.display = 'none';
    startGame();
}

// 游戏主循环
function gameLoop() {
    if (!gameRunning) return;
    
    updateBird();
    updatePipes();
    checkCollisions();
    
    animationId = requestAnimationFrame(gameLoop);
}

// 更新小鸟位置（完全由声音控制）
function updateBird() {
    const currentTime = Date.now();
    if (currentTime - startTime < 3000 && currentFrequency < 200) {
        birdPosition = 300 + 0.006 * (currentTime - startTime);
        birdElement.style.top = `${birdPosition}px`;
        freqIndicator.style.color = 'green';
        return ;
    } else {
        freqIndicator.style.color = 'white';
    }

    // 根据声音频率控制小鸟位置
    if (currentFrequency > 0) {
        // 将频率映射到目标Y位置
        const clampedFreq = Math.max(baseFrequency, Math.min(maxFrequency, currentFrequency));
        const relativePosition = (clampedFreq - baseFrequency) / (maxFrequency - baseFrequency);
        
        // 计算目标Y位置 (频率越高，位置越高)
        const minY = 20;
        const maxY = container.offsetHeight - 60;
        const targetY = maxY - (relativePosition * (maxY - minY));
        
        // 直接设置小鸟位置（无重力模式）
        birdPosition = targetY;
    } else {
        // 添加重力效果
        birdPosition += gravity;
    }
    
    // 应用新位置
    birdElement.style.top = `${birdPosition}px`;
    
    // 旋转小鸟以显示方向
    let rotation = 0;
    if (currentFrequency > 0) {
        // 根据频率变化计算旋转角度
        const clampedFreq = Math.max(baseFrequency, Math.min(maxFrequency, currentFrequency));
        const relativePosition = (clampedFreq - baseFrequency) / (maxFrequency - baseFrequency);
        rotation = (relativePosition - 0.5) * 60; // -30° 到 30°
    }
    birdElement.style.transform = `rotate(${rotation}deg)`;
}

// 创建管道
function createPipe() {
    const pipeTop = document.createElement('div');
    const pipeBottom = document.createElement('div');
    pipeTop.className = 'pipe pipe-top';
    pipeBottom.className = 'pipe pipe-bottom';
    
    // 固定间隙位置，使其更容易通过
    const gapPosition = 150 + Math.random() * 100; // 150-250px之间
    const pipeGap = 180; // 增加间隙大小
    
    pipeTop.style.height = gapPosition + 'px';
    pipeBottom.style.height = (400 - gapPosition - pipeGap) + 'px';
    pipeTop.style.right = '0px';
    pipeBottom.style.right = '0px';
    
    container.appendChild(pipeTop);
    container.appendChild(pipeBottom);
    
    pipes.push({ 
        top: pipeTop, 
        bottom: pipeBottom, 
        passed: false,
        gapTop: gapPosition,
        gapBottom: gapPosition + pipeGap
    });
}

// 更新管道
function updatePipes() {
    const currentTime = Date.now();
    
    // 每2秒创建一个新管道
    if (currentTime - lastPipeTime > 1000) {
        createPipe();
        lastPipeTime = currentTime;
    }

    // 更新现有管道位置
    for (let i = pipes.length - 1; i >= 0; i--) {
        const pipe = pipes[i];
        const currentRight = parseFloat(pipe.top.style.right) || 0;
        const newRight = currentRight + gameSpeed;
        
        pipe.top.style.right = newRight + 'px';
        pipe.bottom.style.right = newRight + 'px';

        // 检查是否通过管道获得分数
        const pipeLeft = container.offsetWidth - newRight - 70;
        if (!pipe.passed && pipeLeft + 70 < 50) {
            score++;
            scoreElement.textContent = score;
            pipe.passed = true;
        }

        // 移除离开屏幕的管道
        if (pipeLeft + 70 < 0) {
            pipe.top.remove();
            pipe.bottom.remove();
            pipes.splice(i, 1);
        }
    }
}

// 碰撞检测
function checkCollisions() {
    const birdRect = birdElement.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    // 检查是否撞到顶部或底部
    if (birdPosition <= 0 || birdPosition >= container.offsetHeight - 60) {
        endGame();
        return;
    }
    
    // 检查是否撞到管道
    for (const pipe of pipes) {
        const topRect = pipe.top.getBoundingClientRect();
        const bottomRect = pipe.bottom.getBoundingClientRect();
        
        // 检查水平重叠
        if (birdRect.right > topRect.left && birdRect.left < topRect.right) {
            // 检查垂直碰撞
            if (birdRect.top < topRect.bottom || birdRect.bottom > bottomRect.top) {
                endGame();
                return;
            }
        }
    }
}

// 结束游戏
function endGame() {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    finalScoreElement.textContent = score;
    gameOverElement.style.display = 'block';
}

// 改进的自相关法估算基频
function estimateFundamentalFreq(buffer, sampleRate) {
    const SIZE = buffer.length;
    
    // 计算RMS能量
    const rms = Math.sqrt(buffer.reduce((sum, val) => sum + val * val, 0) / SIZE);
    
    // 如果能量太低，则认为是静音
    if (rms < 0.01) return 0;

    // 找到缓冲区的有效范围（去除接近0的部分）
    let startIndex = 0;
    let endIndex = SIZE - 1;
    const threshold = rms * 0.1; // 使用动态阈值
    
    while (startIndex < SIZE && Math.abs(buffer[startIndex]) < threshold) startIndex++;
    while (endIndex >= 0 && Math.abs(buffer[endIndex]) < threshold) endIndex--;
    
    if (endIndex <= startIndex) return 0;
    
    const validLength = endIndex - startIndex;
    if (validLength < 100) return 0; // 有效数据太少

    // 自相关计算
    const corr = new Array(validLength).fill(0);
    for (let lag = 0; lag < validLength; lag++) {
        for (let i = startIndex; i < endIndex - lag; i++) {
            corr[lag] += buffer[i] * buffer[i + lag];
        }
    }

    // 寻找第一个峰值（代表基频周期）
    let peakIndex = -1;
    let peakValue = -Infinity;
    
    // 在合理的频率范围内寻找峰值（假设人声范围50-1000Hz）
    const minLag = Math.max(1, Math.floor(sampleRate / 1000)); // 最高1000Hz
    const maxLag = Math.min(validLength - 1, Math.floor(sampleRate / 50)); // 最低50Hz
    
    for (let i = minLag; i < maxLag; i++) {
        // 检查是否是局部极大值
        if (corr[i] > corr[i-1] && corr[i] > corr[i+1] && corr[i] > peakValue) {
            peakValue = corr[i];
            peakIndex = i;
        }
    }
    
    // 如果找到了峰值，计算对应频率
    if (peakIndex > 0 && peakValue > rms * validLength * 0.01) {
        return sampleRate / peakIndex;
    }
    
    return 0;
}

// 辅助方法：从频谱估算主频率
function estimateFrequencyFromSpectrum(analyser) {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    
    // 寻找最大幅值及其索引
    let maxIndex = 0;
    let maxValue = 0;
    
    // 只考虑人声频率范围（约100-1000Hz）
    const minIndex = Math.floor(100 * bufferLength / audioContext.sampleRate);
    const maxIndexLimit = Math.floor(1000 * bufferLength / audioContext.sampleRate);
    
    for (let i = minIndex; i < Math.min(bufferLength, maxIndexLimit); i++) {
        if (dataArray[i] > maxValue) {
            maxValue = dataArray[i];
            maxIndex = i;
        }
    }
    
    // 只有当幅值足够大时才返回频率
    if (maxValue > 10) {
        return maxIndex * audioContext.sampleRate / analyser.fftSize;
    }
    
    return 0;
}