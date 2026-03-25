/**
 * Drag Sort — 拖拽排序模块
 * 3D 透视倾斜 + 阻尼跟随 + FLIP ��动避让动画
 */
(function() {
    let dragState = null;

    // 阻尼参数：越小跟随越慢，手感越「重」
    const DAMPING = 0.08;
    // 3D 倾斜参数
    const MAX_ROTATE_Y = 15;     // 水平拖动最大 Y 轴旋转角度
    const MAX_ROTATE_X = 8;      // 垂直拖动最大 X 轴旋转角度
    const PERSPECTIVE = '800px'; // 透视距离
    // ���让动画时长
    const ANIM_DURATION = 300;
    // 需要拖动多远才开始算「拖拽」（防止误触点击）
    const DRAG_THRESHOLD = 5;

    function initDragSort(containerSelector, cardSelector, onReorder) {
        const containers = document.querySelectorAll(containerSelector);
        containers.forEach(container => {
            container.addEventListener('mousedown', (e) => {
                const card = e.target.closest(cardSelector);
                if (!card || e.button !== 0) return;
                if (e.target.closest('.context-menu')) return;
                // 记���起始点，到达阈值才开始拖拽
                prepareDrag(e, card, container, cardSelector, onReorder);
            });
        });
    }

    function prepareDrag(e, card, container, cardSelector, onReorder) {
        const startX = e.clientX;
        const startY = e.clientY;
        let started = false;

        function onMove(ev) {
            const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
            if (!started && dist > DRAG_THRESHOLD) {
                started = true;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                startDrag(e, card, container, cardSelector, onReorder);
            }
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    function startDrag(e, card, container, cardSelector, onReorder) {
        e.preventDefault();

        const rect = card.getBoundingClientRect();
        const cards = Array.from(container.querySelectorAll(cardSelector));
        const fromIndex = cards.indexOf(card);

        // 创建拖拽幽灵
        const ghost = card.cloneNode(true);
        ghost.style.cssText = `
            position: fixed;
            z-index: 9999;
            pointer-events: none;
            width: ${rect.width}px;
            height: ${rect.height}px;
            left: ${rect.left}px;
            top: ${rect.top}px;
            opacity: 0.92;
            transition: none;
            transform-style: preserve-3d;
            will-change: transform, left, top;
            box-shadow: 0 12px 40px rgba(0,0,0,0.5);
            border-radius: 8px;
        `;
        // 给 ghost 的父级加透���
        const ghostWrapper = document.createElement('div');
        ghostWrapper.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 9998;
            pointer-events: none;
            perspective: ${PERSPECTIVE};
        `;
        ghostWrapper.appendChild(ghost);
        document.body.appendChild(ghostWrapper);

        // 隐藏原卡片
        card.style.opacity = '0';
        card.style.transition = 'none';

        // 幽灵当前位置（阻尼用）
        let ghostX = rect.left;
        let ghostY = rect.top;
        // 鼠标目标位置
        let targetX = rect.left;
        let targetY = rect.top;
        // 速度（用于倾���计算）
        let velocityX = 0;
        let velocityY = 0;
        let prevGhostX = ghostX;
        let prevGhostY = ghostY;

        let animFrame = null;
        let currentToIndex = fromIndex;

        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        dragState = { ghost, ghostWrapper, card, container, cards, cardSelector, fromIndex, onReorder };

        // 阻尼动画循环
        function animate() {
            // 阻尼插值
            ghostX += (targetX - ghostX) * DAMPING;
            ghostY += (targetY - ghostY) * DAMPING;

            // 计算速度（用于 3D 倾斜）
            velocityX = ghostX - prevGhostX;
            velocityY = ghostY - prevGhostY;
            prevGhostX = ghostX;
            prevGhostY = ghostY;

            // 3D 倾斜：��平速度 → rotateY，垂直速度 → rotateX
            const rotateY = clamp(velocityX * 1.2, -MAX_ROTATE_Y, MAX_ROTATE_Y);
            const rotateX = clamp(-velocityY * 0.8, -MAX_ROTATE_X, MAX_ROTATE_X);

            ghost.style.left = ghostX + 'px';
            ghost.style.top = ghostY + 'px';
            ghost.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;

            animFrame = requestAnimationFrame(animate);
        }
        animFrame = requestAnimationFrame(animate);

        function onMouseMove(ev) {
            targetX = ev.clientX - offsetX;
            targetY = ev.clientY - offsetY;

            // 用幽灵的中心点���测悬停
            const centerX = ghostX + rect.width / 2;
            const centerY = ghostY + rect.height / 2;

            const toIndex = findDropIndex(dragState.cards, card, centerX, centerY);
            if (toIndex !== -1 && toIndex !== currentToIndex) {
                currentToIndex = toIndex;
                reorderWithFlip(container, dragState.cards, card, fromIndex, toIndex, cardSelector);
            }
        }

        function onMouseUp() {
            cancelAnimationFrame(animFrame);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // 飞���最终位置
            const finalRect = card.getBoundingClientRect();
            ghost.style.transition = 'all .3s cubic-bezier(0.2, 0, 0, 1)';
            ghost.style.left = finalRect.left + 'px';
            ghost.style.top = finalRect.top + 'px';
            ghost.style.transform = 'rotateX(0deg) rotateY(0deg) scale(1)';
            ghost.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';

            setTimeout(() => {
                ghostWrapper.remove();
                card.style.opacity = '';
                card.style.transition = '';

                if (currentToIndex !== fromIndex && onReorder) {
                    onReorder(fromIndex, currentToIndex);
                }
                dragState = null;
            }, 310);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    function findDropIndex(cards, draggedCard, cx, cy) {
        for (let i = 0; i < cards.length; i++) {
            if (cards[i] === draggedCard) continue;
            const r = cards[i].getBoundingClientRect();
            if (cx > r.left && cx < r.right && cy > r.top && cy < r.bottom) {
                return i;
            }
        }
        return -1;
    }

    function reorderWithFlip(container, cards, draggedCard, fromIndex, toIndex, cardSelector) {
        // 记录当前位置
        const firstRects = new Map();
        cards.forEach(c => {
            if (c !== draggedCard) firstRects.set(c, c.getBoundingClientRect());
        });

        // 移动 DOM
        container.removeChild(draggedCard);
        const remaining = Array.from(container.querySelectorAll(cardSelector));
        const insertAt = toIndex > remaining.length ? remaining.length : toIndex;
        if (insertAt >= remaining.length) {
            container.appendChild(draggedCard);
        } else {
            container.insertBefore(draggedCard, remaining[insertAt]);
        }
        draggedCard.style.opacity = '0';

        // FLIP 动画
        const updated = Array.from(container.querySelectorAll(cardSelector));
        updated.forEach(c => {
            if (c === draggedCard) return;
            const first = firstRects.get(c);
            if (!first) return;
            const last = c.getBoundingClientRect();
            const dx = first.left - last.left;
            const dy = first.top - last.top;
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

            c.style.transition = 'none';
            c.style.transform = `translate(${dx}px, ${dy}px)`;
            requestAnimationFrame(() => {
                c.style.transition = `transform ${ANIM_DURATION}ms cubic-bezier(0.2, 0, 0, 1)`;
                c.style.transform = '';
                setTimeout(() => {
                    c.style.transition = '';
                    c.style.transform = '';
                }, ANIM_DURATION + 10);
            });
        });

        if (dragState) dragState.cards = updated;
    }

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    window.DragSort = { init: initDragSort };
})();
