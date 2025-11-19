// Attitude Indicator for UAV/UGV Dashboard
class AttitudeIndicator {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`Canvas element ${canvasId} not found`);
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
        this.radius = Math.min(this.centerX, this.centerY) - 10;
        
        this.pitch = 0;  // degrees
        this.roll = 0;   // degrees
        this.yaw = 0;    // degrees
        this.dataStale = false;  // 數據是否過時
        
        this.init();
    }

    init() {
        this.setupCanvas();
        this.draw();
        
        // 監聽窗口大小變化
        window.addEventListener('resize', () => {
            this.setupCanvas();
            this.draw();
        });
    }

    setupCanvas() {
        // Set up high DPI canvas
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        // Recalculate center and radius
        this.centerX = rect.width / 2;
        this.centerY = rect.height / 2;
        this.radius = Math.min(this.centerX, this.centerY) - 10;
    }

    update(attitude) {
        if (!attitude) return;
        
        // 使用 rollDeg, pitchDeg, yawDeg（參考資料格式）
        this.pitch = attitude.pitchDeg || attitude.pitch || 0;
        this.roll = attitude.rollDeg || attitude.roll || 0;
        this.yaw = attitude.yawDeg || attitude.yaw || 0;
        this.dataStale = attitude.dataStale || false;
        
        this.draw();
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 如果數據過時，顯示灰色背景和 "No Data" 提示
        if (this.dataStale) {
            this.drawNoData();
            return;
        }
        
        this.ctx.save();
        this.ctx.translate(this.centerX, this.centerY);
        
        // Draw background circle
        this.drawBackground();
        
        // Draw artificial horizon
        this.drawHorizon();
        
        // Draw pitch ladder
        this.drawPitchLadder();
        
        // Draw roll indicator
        this.drawRollIndicator();
        
        // Draw vehicle symbol
        this.drawVehicleSymbol();
        
        // Draw outer ring and markings
        this.drawOuterRing();
        
        this.ctx.restore();
    }

    drawNoData() {
        this.ctx.fillStyle = '#e0e0e0';
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, this.radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.strokeStyle = '#999';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, this.radius, 0, Math.PI * 2);
        this.ctx.stroke();
        
        this.ctx.fillStyle = '#666';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('No Data', this.centerX, this.centerY);
    }

    drawBackground() {
        // Sky (upper half)
        this.ctx.fillStyle = '#87CEEB';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Ground (lower half) - will be clipped by horizon
        this.ctx.fillStyle = '#8B4513';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawHorizon() {
        this.ctx.save();
        
        // Rotate for roll
        this.ctx.rotate(this.roll * Math.PI / 180);
        
        // Calculate horizon line position based on pitch
        const pitchOffset = (this.pitch * this.radius) / 90; // 90 degrees = full radius
        
        // Clip to circular area
        this.ctx.beginPath();
        this.ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        this.ctx.clip();
        
        // Draw sky
        this.ctx.fillStyle = '#87CEEB';
        this.ctx.fillRect(-this.radius, -this.radius, this.radius * 2, this.radius + pitchOffset);
        
        // Draw ground
        this.ctx.fillStyle = '#8B4513';
        this.ctx.fillRect(-this.radius, pitchOffset, this.radius * 2, this.radius * 2);
        
        // Draw horizon line
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(-this.radius, pitchOffset);
        this.ctx.lineTo(this.radius, pitchOffset);
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    drawPitchLadder() {
        this.ctx.save();
        this.ctx.rotate(this.roll * Math.PI / 180);
        
        const pitchOffset = (this.pitch * this.radius) / 90;
        
        // Clip to circular area
        this.ctx.beginPath();
        this.ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        this.ctx.clip();
        
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.lineWidth = 2;
        
        // Draw pitch lines every 10 degrees
        for (let angle = -90; angle <= 90; angle += 10) {
            if (angle === 0) continue; // Skip horizon line
            
            const y = pitchOffset - (angle * this.radius) / 90;
            const lineLength = angle % 30 === 0 ? 60 : 40;
            
            // Draw pitch line
            this.ctx.beginPath();
            this.ctx.moveTo(-lineLength / 2, y);
            this.ctx.lineTo(lineLength / 2, y);
            this.ctx.stroke();
            
            // Draw angle text for major lines
            if (angle % 30 === 0) {
                this.ctx.fillText(Math.abs(angle).toString(), 0, y - 5);
            }
        }
        
        this.ctx.restore();
    }

    drawRollIndicator() {
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.lineWidth = 2;
        
        // Draw roll scale marks
        const rollMarks = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];
        
        rollMarks.forEach(angle => {
            const radian = (angle * Math.PI) / 180;
            const innerRadius = this.radius - 15;
            const outerRadius = this.radius - (angle % 30 === 0 ? 25 : 20);
            
            const x1 = Math.sin(radian) * innerRadius;
            const y1 = -Math.cos(radian) * innerRadius;
            const x2 = Math.sin(radian) * outerRadius;
            const y2 = -Math.cos(radian) * outerRadius;
            
            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
            
            // Add text for major marks
            if (angle % 30 === 0 && angle !== 0) {
                this.ctx.save();
                this.ctx.font = '10px Arial';
                this.ctx.textAlign = 'center';
                const textX = Math.sin(radian) * (outerRadius - 10);
                const textY = -Math.cos(radian) * (outerRadius - 10);
                this.ctx.fillText(Math.abs(angle).toString(), textX, textY + 3);
                this.ctx.restore();
            }
        });
        
        // Draw roll pointer (triangle at top)
        this.ctx.save();
        this.ctx.rotate(this.roll * Math.PI / 180);
        this.ctx.fillStyle = '#FFD700';
        this.ctx.beginPath();
        this.ctx.moveTo(0, -this.radius + 5);
        this.ctx.lineTo(-8, -this.radius + 20);
        this.ctx.lineTo(8, -this.radius + 20);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        this.ctx.restore();
        
        // Draw center triangle (fixed)
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, -this.radius + 5);
        this.ctx.lineTo(-6, -this.radius + 15);
        this.ctx.lineTo(6, -this.radius + 15);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
    }

    drawVehicleSymbol() {
        this.ctx.strokeStyle = '#FFD700';
        this.ctx.fillStyle = '#FFD700';
        this.ctx.lineWidth = 3;
        
        // Draw vehicle symbol (fixed in center)
        // Center dot
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 4, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Wings/body
        this.ctx.beginPath();
        this.ctx.moveTo(-30, 0);
        this.ctx.lineTo(-10, 0);
        this.ctx.moveTo(10, 0);
        this.ctx.lineTo(30, 0);
        this.ctx.stroke();
        
        // Wing tips
        this.ctx.beginPath();
        this.ctx.moveTo(-30, 0);
        this.ctx.lineTo(-30, -8);
        this.ctx.moveTo(30, 0);
        this.ctx.lineTo(30, -8);
        this.ctx.stroke();
    }

    drawOuterRing() {
        // Draw outer circle
        this.ctx.strokeStyle = '#333333';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Draw compass rose for yaw
        this.ctx.save();
        this.ctx.rotate(-this.yaw * Math.PI / 180); // Rotate opposite to yaw
        
        this.ctx.strokeStyle = '#666666';
        this.ctx.fillStyle = '#666666';
        this.ctx.lineWidth = 1;
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        
        // Draw cardinal directions
        const directions = [
            { angle: 0, text: 'N' },
            { angle: 90, text: 'E' },
            { angle: 180, text: 'S' },
            { angle: 270, text: 'W' }
        ];
        
        directions.forEach(dir => {
            const radian = (dir.angle * Math.PI) / 180;
            const x = Math.sin(radian) * (this.radius + 20);
            const y = -Math.cos(radian) * (this.radius + 20);
            
            this.ctx.fillText(dir.text, x, y + 4);
        });
        
        this.ctx.restore();
        
        // Draw yaw indicator (fixed triangle pointing up)
        this.ctx.fillStyle = '#FF6B6B';
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, -this.radius - 25);
        this.ctx.lineTo(-6, -this.radius - 15);
        this.ctx.lineTo(6, -this.radius - 15);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AttitudeIndicator;
}

