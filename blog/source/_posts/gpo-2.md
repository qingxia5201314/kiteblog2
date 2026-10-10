---
title: 'GPO安全筛选、继承与优先级'
date: 2026-07-15T03:06:48.948Z
updated: 2026-07-15T03:21:16.724Z
categories: ['notes']
tags: ['内网渗透']
cover: notes
---
GPO是否生效，不只是“有没有链接”。完整判断链如下：

```
对象位于哪个 Site/Domain/OU
        ↓
该位置是否链接 GPO
        ↓
GPO 链接和对应配置分支是否启用
        ↓
对象是否拥有 Read + Apply Group Policy
        ↓
是否通过 WMI Filter
        ↓
多个策略冲突时计算优先级
```

## 一、安全筛选是什么

默认GPO的“安全筛选”通常是：`Authenticated Users`。它包含已经通过身份验证的域用户和计算机。因此，链接位置内的大多数对象都能应用策略。

应用GPO需要两个权限：

```
Read
Apply Group Policy
```
| Read | Apply Group Policy | 结果 |
|---|---|---|
| 允许 | 允许 | 应用 |
| 允许 | 无 | 不应用 |
| 无 | 允许 | 无法读取，不应用 |
| 拒绝 | 允许 | 拒绝优先，不应用 |

安全筛选本质上就是GPO对象的ACL，不是另一套独立机制

## 二、定向应用实验

目标：创建一个用户策略，只对 IT-Users 组成员生效。

实验效果是在用户注册表中创建：

```
HKCU\Software\CorpLab
GpoMarker = Applied-To-IT-Users
```

1. 检查用户组关系

在DC01:

```
Get-ADGroupMember "IT-Users"
Get-ADUser alice -Properties memberOf |
    Select-Object -ExpandProperty memberOf
```

确保 alice 属于 IT-Users，bob 不属于。

2.创建GPO


![image.png](/media/migrated/img-62ed5820-7102-4e72-9aba-e87b07f6613a.png)


3. 编辑注册表首选项



![image.png](/media/migrated/img-b8ac7629-55f7-473c-96db-1bc46d41b305.png)

## 三、设置安全筛选

选择GPO的‘作用域’页面，在安全筛选中：

1. 删除Authenticated Users

2.添加 IT-Users

结果为：

```
安全筛选
└── CORP\IT-Users
```

然后打开委派，高级

确认:

```
IT-Users:
  允许 Read
  允许 Apply Group Policy
```

添加：

```
Domain Computers:
  允许 Read
  不允许 Apply Group Policy
```
这是一个重要细节：现代 Windows 在处理某些用户策略时，会使用计算机账户读取 GPO。因此计算机需要读取权限，但不需要应用权限。

不要用 Deny Apply Group Policy 排除普通用户。Deny 的优先级很高，用户同时属于多个组时容易产生难以排查的结果。


## 四、验证策略



![image.png](/media/migrated/img-0e3f0368-6e40-4b6d-9050-c6da8bfcecee.png)

## 五、继承与优先级



![image.png](/media/migrated/img-15b2b7dd-8cbb-421f-8e19-152c3a866bc0.png)



![image.png](/media/migrated/img-7a52caa8-173f-4516-a692-a0f11c07fa0e.png)


