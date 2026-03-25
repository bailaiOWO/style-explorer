const I18N = {
    _locale: 'en',
    _listeners: [],

    translations: {
        en: {
            'app.title': '✦ Style Explorer',
            'nav.gallery': 'Gallery',
            'nav.inspiration': 'Inspiration',
            'nav.upload': 'Upload',
            'stats.entries': 'entries',

            'search.placeholder': 'Search styles...',
            'sort.label': 'Sort',
            'sort.popular': 'Popular',
            'sort.newest': 'Newest',
            'sort.name': 'Name',
            'sort.shuffle': 'Shuffle',
            'grid.label': 'Columns',
            'grid.height': 'Height',

            'empty.title': 'Nothing here yet',
            'empty.desc': 'Drag and drop an image anywhere to get started',

            'upload.title': 'New Entry',
            'upload.tag1.label': 'Artist Tag',
            'upload.name.label': 'Name',
            'upload.name.hint': 'for your memory',
            'upload.tags.label': 'Tags',
            'upload.tags.hint': 'comma separated',
            'upload.prompt.label': 'Prompt',
            'upload.prompt.hint': 'extracted from PNG metadata',
            'upload.prompt.placeholder': 'No prompt metadata found',
            'upload.submit': 'Add',
            'upload.submitting': 'Adding...',
            'upload.auto': 'auto-detected',

            'edit.title': 'Edit Entry',
            'edit.save': 'Save',

            'drop.text': 'Drop image to upload',

            'card.notags': 'no tags',
            'card.delete': 'Delete entry',

            'ctx.edit': 'Edit',
            'ctx.copyTag': 'Copy Tag',
            'ctx.copyPrompt': 'Copy Prompt',
            'ctx.delete': 'Delete',

            'ctx.toggleNsfw': 'Mark as R18',
            'ctx.unNsfw': 'Unmark R18',
            'nsfw.show': 'R18',

            'lightbox.clicks': '{n} clicks',
            'lightbox.click': '{n} click',

            'toast.copied': 'Copied "{name}"',
            'toast.copiedPrompt': 'Prompt copied',
            'toast.deleted': 'Deleted',
            'toast.added': 'Added "{name}"',
            'toast.saved': 'Saved',
            'toast.needName': 'Please enter a name',
            'toast.noImage': 'No image to upload',
            'toast.dropImage': 'Please drop an image file',
            'toast.noresults': 'No results found',
            'toast.noPrompt': 'No prompt data',

            'confirm.delete': 'Delete "{name}"?',

            'lang.switch': '中文',
        },

        zh: {
            'app.title': '✦ 风格浏览器',
            'nav.gallery': '画廊',
            'nav.inspiration': '灵感',
            'nav.upload': '上传',
            'stats.entries': '个条目',

            'search.placeholder': '搜索风格...',
            'sort.label': '排序',
            'sort.popular': '热门',
            'sort.newest': '最新',
            'sort.name': '名称',
            'sort.shuffle': '随机',
            'grid.label': '列数',
            'grid.height': '高度',

            'empty.title': '还没有内容',
            'empty.desc': '拖拽图片到任意位置即可开始',

            'upload.title': '新条目',
            'upload.tag1.label': '画师串',
            'upload.name.label': '名称',
            'upload.name.hint': '方便记忆',
            'upload.tags.label': '标签',
            'upload.tags.hint': '用逗号分隔',
            'upload.prompt.label': '提示词',
            'upload.prompt.hint': '从 PNG 元数据提取',
            'upload.prompt.placeholder': '未找到提示词元数据',
            'upload.submit': '添加',
            'upload.submitting': '添加中...',
            'upload.auto': '自动识别',

            'edit.title': '编辑条目',
            'edit.save': '保存',

            'drop.text': '拖放图片以上传',

            'card.notags': '无标签',
            'card.delete': '删除条目',

            'ctx.edit': '编辑',
            'ctx.copyTag': '复制画师串',
            'ctx.copyPrompt': '复制提示词',
            'ctx.delete': '删除',

            'ctx.toggleNsfw': '标记��� R18',
            'ctx.unNsfw': '取消 R18',
            'nsfw.show': 'R18',

            'lightbox.clicks': '{n} 次点击',
            'lightbox.click': '{n} 次点击',

            'toast.copied': '已复制 "{name}"',
            'toast.copiedPrompt': '提示词已复制',
            'toast.deleted': '已删除',
            'toast.added': '已添加 "{name}"',
            'toast.saved': '已保存',
            'toast.needName': '请输入名称',
            'toast.noImage': '没有要上传的图片',
            'toast.dropImage': '请拖放图片文件',
            'toast.noresults': '没有找到结果',
            'toast.noPrompt': '无提示词数据',

            'confirm.delete': '确定删除 "{name}" 吗？',

            'lang.switch': 'EN',
        }
    },

    init() {
        const saved = localStorage.getItem('locale');
        if (saved && this.translations[saved]) {
            this._locale = saved;
        } else {
            const lang = (navigator.language || 'en').toLowerCase();
            this._locale = lang.startsWith('zh') ? 'zh' : 'en';
        }
    },

    get locale() { return this._locale; },

    toggle() {
        this._locale = this._locale === 'en' ? 'zh' : 'en';
        localStorage.setItem('locale', this._locale);
        this._listeners.forEach(fn => fn(this._locale));
    },

    onChange(fn) { this._listeners.push(fn); },

    t(key, params = {}) {
        const dict = this.translations[this._locale] || this.translations.en;
        let text = dict[key] || this.translations.en[key] || key;
        for (const [k, v] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
        }
        return text;
    }
};

I18N.init();