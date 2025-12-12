document.addEventListener('DOMContentLoaded', () => {
    new NumberMaze();
});

class NumberMaze {
    constructor() {
        this.rows = 8;
        this.cols = 8;
        this.targetLength = 60; // Default medium
        
        this.grid = []; 
        this.currentStep = 0;
        this.maxNumber = 0;
        this.lastPos = null;
        this.activeCells = []; 
        
        this.boardEl = document.getElementById('game-board');
        this.statusEl = document.getElementById('status');
        this.restartBtn = document.getElementById('restart-btn');
        this.difficultySelect = document.getElementById('difficulty-select');
        
        this.restartBtn.addEventListener('click', () => this.init());
        this.difficultySelect.addEventListener('change', () => this.init());
        
        this.init();
    }

    init() {
        this.setDifficulty();
        this.currentStep = 0;
        this.activeCells = [];
        this.lastPos = null;
        this.boardEl.style.pointerEvents = 'auto';
        this.generateLevel();
        this.render();
        this.updateStatus("请点击数字 1 开始游戏");
    }
    
    setDifficulty() {
        const diff = this.difficultySelect.value;
        switch(diff) {
            case 'easy':
                this.rows = 7;
                this.cols = 7;
                this.targetLength = 40;
                break;
            case 'medium':
                this.rows = 8;
                this.cols = 8;
                this.targetLength = 60;
                break;
            case 'hard':
                this.rows = 11;
                this.cols = 10;
                this.targetLength = 100;
                break;
        }
    }

    generateLevel() {
        let success = false;
        while (!success) {
            // 1. Initialize Grid
            this.grid = Array(this.rows).fill().map(() => Array(this.cols).fill(null));
            let validCells = [];

            // 2. Create irregular shape (Holes)
            for(let r=0; r<this.rows; r++) {
                for(let c=0; c<this.cols; c++) {
                    // Adjust hole probability based on grid size/tightness needed
                    // For hard mode (100 cells in 110 grid), we need low hole rate
                    // For easy (40 in 49), low hole rate
                    // Medium (60 in 64), very low hole rate or 0
                    
                    let holeProb = 0.15;
                    if (this.targetLength / (this.rows * this.cols) > 0.85) {
                        holeProb = 0.05; // Very dense
                    }
                    
                    if (Math.random() < holeProb) {
                        this.grid[r][c] = { isHole: true, value: null, isHidden: false };
                    } else {
                        this.grid[r][c] = { isHole: false, value: 0, isHidden: false };
                        validCells.push({r, c});
                    }
                }
            }

            if (validCells.length < this.targetLength) continue; 

            // 3. Generate Path
            let bestPath = [];
            for(let i=0; i<3000; i++) {
                let start = validCells[Math.floor(Math.random() * validCells.length)];
                let path = this.randomWalk(start, this.targetLength); 
                if (path.length > bestPath.length) {
                    bestPath = path;
                    if (bestPath.length >= this.targetLength) break; 
                }
            }
            
            // Check if we met target length requirement
            // We accept slightly less if hard to find exact, but user requested specific ranges.
            // Let's try to enforce at least 90% of target if target is large, or exact if small.
            if (bestPath.length >= this.targetLength * 0.95) {
                // If path is longer than target, truncate it? 
                // User said "1-40", so max should probably be close to 40.
                // Let's truncate to targetLength if it exceeds
                if (bestPath.length > this.targetLength) {
                    bestPath = bestPath.slice(0, this.targetLength);
                }
                
                this.maxNumber = bestPath.length;
                
                // Mark everything as hole initially
                for(let r=0; r<this.rows; r++) {
                    for(let c=0; c<this.cols; c++) {
                        this.grid[r][c].isHole = true;
                        this.grid[r][c].value = null;
                    }
                }

                // Fill path numbers
                let consecutiveHidden = 0;
                
                // Determine hide rate for this level (random between 0.6 and 0.8)
                let currentHideRate = 0.6 + Math.random() * 0.2;
                
                bestPath.forEach((pos, index) => {
                    let cell = this.grid[pos.r][pos.c];
                    cell.isHole = false;
                    cell.value = index + 1; // Correct solution value (kept for debugging or hints if needed)
                    cell.isPath = true;
                    cell.userValue = null; // Value filled by user
                    
                    let shouldHide = false;
                    
                    // Hide numbers logic
                    if (cell.value === 1 || cell.value === this.maxNumber) {
                        shouldHide = false; 
                    } else {
                        if (consecutiveHidden >= 5) {
                            shouldHide = false;
                        } else {
                            shouldHide = Math.random() < currentHideRate;
                        }
                    }
                    
                    if (shouldHide) {
                        cell.isAnchor = false; // Player needs to fill this
                        cell.isHidden = true;  // Visually hidden initially
                        consecutiveHidden++;
                    } else {
                        cell.isAnchor = true;  // Fixed number provided by game
                        cell.isHidden = false;
                        consecutiveHidden = 0;
                    }
                });
                
                success = true;
            }
        }
    }

    randomWalk(start, targetLen) {
        let path = [{...start}];
        let seen = new Set([`${start.r},${start.c}`]);
        let curr = start;
        
        // DFS-like greedy walk with backtracking is better for long paths, 
        // but simple random walk with lookahead or heuristic might suffice for this grid size.
        // Let's improve random walk: prefer neighbors that have fewer free neighbors (Warnsdorff's rule heuristic)
        
        while(true) {
            let neighbors = [];
            for(let dr=-1; dr<=1; dr++) {
                for(let dc=-1; dc<=1; dc++) {
                    if(dr===0 && dc===0) continue;
                    let nr = curr.r+dr, nc = curr.c+dc;
                    if (nr>=0 && nr<this.rows && nc>=0 && nc<this.cols && 
                        !this.grid[nr][nc].isHole && !seen.has(`${nr},${nc}`)) {
                        neighbors.push({r: nr, c: nc});
                    }
                }
            }
            
            if (neighbors.length === 0) break;
            
            // Heuristic: Pick neighbor with fewest available next moves to extend path duration
            // This is computationally more expensive but better for coverage
            neighbors.sort((a, b) => {
                let aFree = this.countFreeNeighbors(a, seen);
                let bFree = this.countFreeNeighbors(b, seen);
                // Add some randomness to avoid getting stuck in same loops
                return (aFree - bFree) + (Math.random() - 0.5); 
            });

            // Pick top 1 or 2
            let next = neighbors[0];
            
            path.push(next);
            seen.add(`${next.r},${next.c}`);
            curr = next;
        }
        return path;
    }

    countFreeNeighbors(pos, seen) {
        let count = 0;
        for(let dr=-1; dr<=1; dr++) {
            for(let dc=-1; dc<=1; dc++) {
                if(dr===0 && dc===0) continue;
                let nr = pos.r+dr, nc = pos.c+dc;
                if (nr>=0 && nr<this.rows && nc>=0 && nc<this.cols && 
                    !this.grid[nr][nc].isHole && !seen.has(`${nr},${nc}`)) {
                    count++;
                }
            }
        }
        return count;
    }

    render() {
        this.boardEl.style.gridTemplateColumns = `repeat(${this.cols}, 50px)`;
        this.boardEl.innerHTML = '';
        
        for(let r=0; r<this.rows; r++) {
            for(let c=0; c<this.cols; c++) {
                let cellData = this.grid[r][c];
                let cellEl = document.createElement('div');
                cellEl.classList.add('cell');
                cellEl.dataset.r = r;
                cellEl.dataset.c = c;
                
                if (cellData.isHole) {
                    cellEl.classList.add('empty');
                } else {
                    // Logic for showing numbers
                    if (cellData.isAnchor) {
                        // Anchors always show their original value
                        cellEl.textContent = cellData.value;
                        cellEl.classList.add('anchor'); // Optional styling for anchors
                    } else {
                        // Non-anchors show user value if present
                        if (cellData.userValue) {
                            cellEl.textContent = cellData.userValue;
                            cellEl.classList.remove('hidden-value');
                        } else {
                            cellEl.classList.add('hidden-value');
                        }
                    }
                    
                    // Active styling
                    if (this.activeCells.some(ac => ac.r === r && ac.c === c)) {
                         cellEl.classList.add('active');
                    }
                    
                    // Last active styling
                    if (this.lastPos && this.lastPos.r === r && this.lastPos.c === c) {
                        cellEl.classList.add('last-active');
                    }

                    cellEl.addEventListener('click', (e) => this.handleCellClick(r, c, cellEl));
                }
                
                this.boardEl.appendChild(cellEl);
            }
        }
    }

    handleCellClick(r, c, el) {
        let cellData = this.grid[r][c];
        
        // Undo/Rewind logic
        if (el.classList.contains('active')) {
            let clickedVal = cellData.isAnchor ? cellData.value : cellData.userValue;
            
            // If clicking the current last step, do nothing (or we could confirm restart?)
            if (clickedVal === this.currentStep) {
                return;
            }
            
            // If clicking a previous step, confirm rewind
            if (clickedVal < this.currentStep) {
                // Use a small timeout to let the click event finish visually
                setTimeout(() => {
                    if (confirm(`确定要回退到数字 ${clickedVal} 吗？`)) {
                        while (this.currentStep > clickedVal) {
                            this.undoLastStep();
                        }
                    }
                }, 10);
                return;
            }
            return;
        }
        
        let nextVal = this.currentStep + 1;
        
        // Start logic
        if (this.currentStep === 0) {
            if (cellData.isAnchor && cellData.value === 1) {
                this.activateCell(el, r, c, 1);
            } else {
                // Wrong number at start
                this.showError(el);
                this.updateStatus("必须从 1 开始！", true);
            }
            return;
        }
        
        // Continue logic
        if (this.isAdjacent(r, c, this.lastPos.r, this.lastPos.c)) {
            if (cellData.isAnchor) {
                // If it's an anchor (fixed number), it MUST match the next step
                if (cellData.value === nextVal) {
                    this.activateCell(el, r, c, nextVal);
                } else {
                    this.showError(el);
                    this.updateStatus(`错误：这个格子是 ${cellData.value}，你需要连到 ${nextVal}`, true);
                }
            } else {
                // If it's not an anchor (hidden/empty), player can fill it with nextVal
                // We DON'T check if it matches the generated path. Player makes their own path.
                cellData.userValue = nextVal;
                cellData.isHidden = false;
                el.textContent = nextVal;
                el.classList.remove('hidden-value');
                this.activateCell(el, r, c, nextVal);
            }
        } else {
            this.showError(el);
            this.updateStatus("只能连接相邻的格子！", true);
        }
    }
    
    activateCell(el, r, c, val) {
        el.classList.add('active');
        
        // Update previous last-active
        if (this.activeCells.length > 0) {
            this.activeCells[this.activeCells.length - 1].el.classList.remove('last-active');
        }
        
        el.classList.add('last-active');
        
        this.activeCells.push({el, r, c, val});
        this.lastPos = { r, c };
        this.currentStep = val;
        
        if (this.currentStep === this.maxNumber) {
            this.updateStatus("🎉 恭喜你！成功通关！ 🎉");
            this.boardEl.style.pointerEvents = 'none'; // Disable further clicks
            setTimeout(() => {
                alert("恭喜通关！");
            }, 100);
        } else {
            this.updateStatus(`当前: ${val} -> 请寻找 ${val + 1}`);
        }
    }
    
    undoLastStep() {
        if (this.activeCells.length === 0) return;
        
        // Remove current
        let current = this.activeCells.pop();
        current.el.classList.remove('active', 'last-active');
        
        // If it was a user-filled cell (not anchor), reset it
        let cellData = this.grid[current.r][current.c];
        if (!cellData.isAnchor) {
            cellData.userValue = null;
            cellData.isHidden = true;
            current.el.textContent = '';
            current.el.classList.add('hidden-value');
        }
        
        if (this.activeCells.length > 0) {
            // Restore previous
            let prev = this.activeCells[this.activeCells.length - 1];
            prev.el.classList.add('last-active');
            this.lastPos = { r: prev.r, c: prev.c };
            this.currentStep = prev.val;
            this.updateStatus(`回退到: ${prev.val} -> 请寻找 ${prev.val + 1}`);
        } else {
            // Back to start
            this.lastPos = null;
            this.currentStep = 0;
            this.updateStatus("请点击数字 1 开始游戏");
        }
        
        this.boardEl.style.pointerEvents = 'auto';
    }

    isAdjacent(r1, c1, r2, c2) {
        let dr = Math.abs(r1 - r2);
        let dc = Math.abs(c1 - c2);
        return dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0);
    }
    
    showError(el) {
        el.classList.add('error');
        setTimeout(() => el.classList.remove('error'), 400);
    }
    
    updateStatus(msg, isError = false) {
        this.statusEl.textContent = msg;
        this.statusEl.style.color = isError ? '#e74c3c' : '#e67e22';
    }
}
