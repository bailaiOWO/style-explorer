/**
 * Drag Sort — 拖拽排序模块
 * 3D 透视倾斜 + 阻尼跟随 + FLIP 自动避让动画
 */
(function() {
    let dragState = null;
    let isDragging = false;  // 暴露给外部，用于禁止 drop overlay

    const DAMPING = 0.08;
    const MAX_ROTATE_Y = 15;
    const MAX_ROTATE_X = 8;
    const PERSPECTIVE = '800px';
    const ANIM_DURATION = 300;
    const DRAG_THRESHOLD = 5;
    const REORDER_COOLDOWN = 200; // 避让动画冷却时间 ms

    function initDragSort(containerSelector, cardSelector, onReorder) {
        const containers = document.querySelectorAll(containerSelector);
        containers.forEach(container => {
            container.addEventListener('mousedown', (e) => {
                const card = e.target.closest(cardSelector);
                if (!card || e.button !== 0) return;
                if (e.target.closest('.context-menu')) return;
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
        isDragging = true;

        // 禁止浏览器原生图片拖拽
        const preventNativeDrag = (ev) => ev.preventDefault();
        document.addEventListener('dragstart', preventNativeDrag, true);

        const rect = card.getBoundingClientRect();
        const cards = Array.from(container.querySelectorAll(cardSelector));
        const fromIndex = cards.indexOf(card);

        // 创��幽灵
        const ghost = card.cloneNode(true);
        ghost.style.cssText = `
            position: fixed;
            z-index: 9999;
            pointer-events: none;
            width: ${rect.width}px;
            height: ${rect.height}px;
            left: ${rect.left}px;
            top: ${rect.top}px;
            opacity: 1;
            transition: none;
            transform-style: preserve-3d;
            will-change: transform, left, top;
            box-shadow: 0 16px 48px rgba(0,0,0,0.5);
            border-radius: 8px;
            overflow: hidden;
        `;

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

        // 原卡片占位但不可见
        card.style.visibility = 'hidden';
        card.style.transition = 'none';

        let ghostX = rect.left;
        let ghostY = rect.top;
        let targetX = rect.left;
        let targetY = rect.top;
        let prevGhostX = ghostX;
        let prevGhostY = ghostY;
        let animFrame = null;
        let currentToIndex = fromIndex;
        let lastReorderTime = 0;  // 冷却计时器

        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        dragState = { ghost, ghostWrapper, card, container, cards, cardSelector, fromIndex, onReorder };

        // 阻尼动画
        function animate() {
            ghostX += (targetX - ghostX) * DAMPING;
            ghostY += (targetY - ghostY) * DAMPING;

            const vx = ghostX - prevGhostX;
            const vy = ghostY - prevGhostY;
            prevGhostX = ghostX;
            prevGhostY = ghostY;

            const rotateY = clamp(vx * 1.5, -MAX_ROTATE_Y, MAX_ROTATE_Y);
            const rotateX = clamp(-vy * 1.0, -MAX_ROTATE_X, MAX_ROTATE_X);

            ghost.style.left = ghostX + 'px';
            ghost.style.top = ghostY + 'px';
            ghost.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;

            animFrame = requestAnimationFrame(animate);
        }
        animFrame = requestAnimationFrame(animate);

        function onMouseMove(ev) {
            ev.preventDefault(); // 防止浏览器默认拖拽���为
            targetX = ev.clientX - offsetX;
            targetY = ev.clientY - offsetY;

            // 节流：冷却期内不��排
            const now = Date.now();
            if (now - lastReorderTime < REORDER_COOLDOWN) return;

            const centerX = ghostX + rect.width / 2;
            const centerY = ghostY + rect.height / 2;

            const toIndex = findDropIndex(dragState.cards, card, centerX, centerY);
            if (toIndex !== -1 && toIndex !== currentToIndex) {
                currentToIndex = toIndex;
                lastReorderTime = now;
                reorderWithFlip(container, dragState.cards, card, fromIndex, toIndex, cardSelector);
            }
        }

        function onMouseUp() {
            cancelAnimationFrame(animFrame);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            const finalRect = card.getBoundingClientRect();
            ghost.style.transition = 'all .3s cubic-bezier(0.2, 0, 0, 1)';
            ghost.style.left = finalRect.left + 'px';
            ghost.style.top = finalRect.top + 'px';
            ghost.style.transform = 'rotateX(0deg) rotateY(0deg) scale(1)';
            ghost.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';

            setTimeout(() => {
                ghostWrapper.remove();
                document.removeEventListener('dragstart', preventNativeDrag, true);
                card.style.visibility = '';
                card.style.transition = '';

                if (currentToIndex !== fromIndex && onReorder) {
                    onReorder(fromIndex, currentToIndex);
                }
                dragState = null;
                isDragging = false;
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
        const firstRects = new Map();
        cards.forEach(c => {
            if (c !== draggedCard) firstRects.set(c, c.getBoundingClientRect());
        });

        container.removeChild(draggedCard);
        const remaining = Array.from(container.querySelectorAll(cardSelector));
        const insertAt = Math.min(toIndex, remaining.length);
        if (insertAt >= remaining.length) {
            container.appendChild(draggedCard);
        } else {
            container.insertBefore(draggedCard, remaining[insertAt]);
        }
        draggedCard.style.visibility = 'hidden';

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

    window.DragSort = {
        init: initDragSort,
        get isDragging() { return isDragging; }
    };
})();
