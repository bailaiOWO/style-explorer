/**
 * Drag Sort — 拖拽排序模块
 * 支持阻尼跟随、方向倾斜、FLIP 自动避让动画
 */
(function() {
    let dragState = null;
    const DAMPING = 0.15;        // 阻尼系数（越小越慢）
    const MAX_TILT = 8;          // 最大倾��角度
    const ANIM_DURATION = 300;   // ���让动画时长 ms

    /**
     * 初始化拖拽排序
     * @param {string} containerSelector - 容器选择器
     * @param {string} cardSelector - 卡片选择器
     * @param {Function} onReorder - 排序完成回调 (fromIndex, toIndex)
     */
    function initDragSort(containerSelector, cardSelector, onReorder) {
        const containers = document.querySelectorAll(containerSelector);
        containers.forEach(container => {
            container.addEventListener('mousedown', (e) => {
                const card = e.target.closest(cardSelector);
                if (!card || e.button !== 0) return;
                // 不干扰右键菜单
                if (e.target.closest('.context-menu')) return;
                startDrag(e, card, container, cardSelector, onReorder);
            });
        });
    }

    function startDrag(e, card, container, cardSelector, onReorder) {
        e.preventDefault();

        const rect = card.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const cards = Array.from(container.querySelectorAll(cardSelector));
        const fromIndex = cards.indexOf(card);

        // 记录所有卡片初始位置（用于 FLIP）
        const initialRects = new Map();
        cards.forEach(c => initialRects.set(c, c.getBoundingClientRect()));

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
            opacity: 0.9;
            transition: none;
            transform-origin: center center;
            will-change: transform, left, top;
        `;
        document.body.appendChild(ghost);

        // 隐藏原卡片
        card.style.opacity = '0';
        card.style.transition = 'none';

        // 当前幽灵位置（用于阻尼）
        let ghostX = rect.left;
        let ghostY = rect.top;
        let targetX = rect.left;
        let targetY = rect.top;
        let lastMoveX = 0;
        let animFrame = null;
        let currentToIndex = fromIndex;

        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        dragState = { ghost, card, container, cards, cardSelector, fromIndex, onReorder };

        // 阻尼动画循环
        function animateGhost() {
            ghostX += (targetX - ghostX) * DAMPING;
            ghostY += (targetY - ghostY) * DAMPING;

            // 根据水平移动方向���算倾斜
            const dx = targetX - ghostX;
            const tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, dx * 0.3));

            ghost.style.left = ghostX + 'px';
            ghost.style.top = ghostY + 'px';
            ghost.style.transform = `rotate(${tilt}deg) scale(1.03)`;

            animFrame = requestAnimationFrame(animateGhost);
        }
        animFrame = requestAnimationFrame(animateGhost);

        function onMouseMove(e) {
            targetX = e.clientX - offsetX;
            targetY = e.clientY - offsetY;
            lastMoveX = e.movementX;

            // 计算幽灵中心点
            const centerX = targetX + rect.width / 2;
            const centerY = targetY + rect.height / 2;

            // 找到幽灵下方最近的卡片
            const toIndex = findDropIndex(cards, card, centerX, centerY);

            if (toIndex !== -1 && toIndex !== currentToIndex) {
                currentToIndex = toIndex;
                // FLIP 动画重排
                reorderWithFlip(container, cards, card, fromIndex, toIndex, cardSelector);
            }
        }

        function onMouseUp() {
            cancelAnimationFrame(animFrame);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // 获取卡片最终位置，做��个飞回动画
            const finalRect = card.getBoundingClientRect();
            ghost.style.transition = 'all .25s cubic-bezier(0.2, 0, 0, 1)';
            ghost.style.left = finalRect.left + 'px';
            ghost.style.top = finalRect.top + 'px';
            ghost.style.transform = 'rotate(0deg) scale(1)';
            ghost.style.opacity = '1';

            setTimeout(() => {
                ghost.remove();
                card.style.opacity = '';
                card.style.transition = '';

                // 回调��知排序结果
                if (currentToIndex !== fromIndex && onReorder) {
                    onReorder(fromIndex, currentToIndex);
                }
                dragState = null;
            }, 260);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    /**
     * 根据幽灵中心点找到应该插入的位置
     */
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

    /**
     * 用 FLIP 动画重新排列 DOM
     */
    function reorderWithFlip(container, cards, draggedCard, fromIndex, toIndex, cardSelector) {
        // 记��当前所有卡片位置
        const firstRects = new Map();
        cards.forEach(c => {
            if (c !== draggedCard) firstRects.set(c, c.getBoundingClientRect());
        });

        // 移动 DOM
        const allCards = Array.from(container.querySelectorAll(cardSelector));
        const draggedEl = allCards.find(c => c === draggedCard);
        if (!draggedEl) return;

        // 从 DOM 中临时移除拖拽的卡片
        container.removeChild(draggedCard);
        const remainingCards = Array.from(container.querySelectorAll(cardSelector));

        // 插入到新位置
        const adjustedIndex = toIndex > remainingCards.length ? remainingCards.length : toIndex;
        if (adjustedIndex >= remainingCards.length) {
            container.appendChild(draggedCard);
        } else {
            container.insertBefore(draggedCard, remainingCards[adjustedIndex]);
        }

        // 保持拖拽卡片不可见
        draggedCard.style.opacity = '0';

        // FLIP 动画其他卡片
        const updatedCards = Array.from(container.querySelectorAll(cardSelector));
        updatedCards.forEach(c => {
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

        // 更新 cards 引用
        if (dragState) {
            dragState.cards = updatedCards;
        }
    }

    // 暴露到全局
    window.DragSort = { init: initDragSort };
})();
