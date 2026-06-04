# 参数化头部 OBJ 生成器

一个纯前端静态网站，用男性/女性 OBJ 头模作为基础网格，通过人体测量参数实时变形，并导出当前参数下的 OBJ 文件。

## 项目结构

```text
web/modules/generate/
  index.html
  generator.js
  generator.css
  README.md
  assets/models/
    asian-head.obj
    female-head.obj
```

## 运行方式

在项目目录启动任意静态服务器：

```powershell
python -m http.server 4180 --bind 127.0.0.1
```

然后打开：

```text
http://127.0.0.1:8000/web/modules/generate/index.html
```

## 功能

- 男性 / 女性基础头模切换
- 29 个头部测量参数滑杆
- 3D、正面、侧面预览
- 线框预览开关
- 导出当前变形结果为 OBJ

## 说明

女性模型面数较高，页面会使用抽样面片进行实时预览，导出 OBJ 时仍使用完整顶点和面数据。
