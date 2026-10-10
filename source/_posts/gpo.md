---
title: 'GPO组策略'
date: 2026-07-12T10:06:36.092Z
updated: 2026-07-12T10:47:38.656Z
categories: ['notes']
tags: ['内网渗透']
cover: notes
---
**GPO 全称是 Group Policy Object，中文是“组策略对象”。**

它用于在域内集中配置用户和计算机，例如

```
统一密码与锁定策略
配置登录提示
设置防火墙、审计策略
限制控制面板或命令行
部署软件、脚本、证书
配置浏览器和 Windows Defender
将特定域组加入本地管理员组
```
它把前面学到的 AD、LDAP、Kerberos、DNS 和 SMB 串了起来：

```
客户端通过 DNS 找到域控制器
        ↓
使用 Kerberos 验证身份
        ↓
通过 LDAP 查询适用的 GPO
        ↓
通过 SMB 读取 \\corp.local\SYSVOL
        ↓
客户端组策略扩展执行具体配置
```

## 一. GPO的两个组成部分

- GPC

保存位置：Active Directory

主要内容：名称、版本、权限、状态等源数据

通过LDAP查询
- GPT 

保存位置：SYSVOL共享

主要内容：策略文件、脚本、注册表配置等

位于：\\corp.local\SYSVOL\corp.local\Policies

## 二、GPO链接在哪里

GPO 本身只是一个策略对象，必须链接到以下 AD 位置之一才会生效：

```
站点 Site
域 Domain
组织单位 OU
```

不能直接把 GPO 链接到用户、组或单台计算机对象。

## 三、创建第一个GPO

> 给实验客户端设置一个登录提示，以便直观看到策略确实生效。

1. 把客户端移入OU

在DC01打开AD用户和计算机

找到computer，移动客户端账户


![image.png](/media/migrated/img-948b9b7a-d35f-4952-af28-101ef23ab982.png)


移动到Lab-computer

2. 打开组策略管理

`gpmc.msc`

展开

```
林: corp.local
└── 域
    └── corp.local
        └── Lab-Computers
```
右键`Lab-Computers`，选择：

`在这个域中创建 GPO 并在此处链接`

名字写：

`LAB-Workstation-Baseline`

3. 编辑策略

右键新建的GPO，选择“编辑”，进入：

```
计算机配置
→ 策略
→ Windows 设置
→ 安全设置
→ 本地策略
→ 安全选项
```


![image.png](/media/migrated/img-230028fb-f7ce-43a9-9b21-1f6e5923738d.png)

配置下面两个项目：

`交互式登录: 试图登录的用户的消息标题`

设置为

`CORP Laboratory`

然后配置：

`交互式登录: 试图登录的用户的消息文本`

设置为：

`This computer is managed by the CORP laboratory domain.`

## 四、客户端更新验证

cmd输入：

`gpupdate /force`

查看计算机策略

`gpresult /r /scope computer`



![image.png](/media/migrated/img-234605c0-30fb-45f4-82d6-26fc9ffaab3f.png)

## 五、计算机配置与用户配置



![image.png](/media/migrated/img-e3ac8ecc-d6be-47f1-9464-1000c5b35209.png)

## 六、GPO的应用顺序

默认应用顺序简称LSDOU：

```
Local → Site → Domain → OU
本地策略 → 站点策略 → 域策略 → OU 策略
```

后应用的策略通常可以覆盖前面的冲突配置。

如果 OU 有嵌套：

```
corp.local
└── Lab-Computers
    └── IT-Computers
```

顺序为：

`本地 → 站点 → 域 → Lab-Computers → IT-Computers`

距离对象越近的 OU 策略通常优先级越高。

## 七、常用排错命令

客户端看自己由哪个域控处理：

```
echo %LOGONSERVER%
nltest /dsgetdc:corp.local
```

检查DNS：

`nslookup -type=SRV _ldap._tcp.dc._msdcs.corp.local`

检查策略：

```
gpupdate /force
gpresult /r
gpresult /z
rsop.msc
```

检查域和SYSVOL：

```
dir \\corp.local\SYSVOL
dir \\DC01\SYSVOL
```

如果 gpupdate 出现 1058、1030 等错误，优先检查：

```
客户端 DNS 是否只指向 DC01。
客户端时间与 DC01 是否相差过大。
\\corp.local\SYSVOL 是否能访问。
计算机对象是否真的位于 Lab-Computers。
GPO 是否已经链接，而不只是创建。
GPO 的“计算机配置”是否被禁用。
```

完成后，关键验证结果应是：

`gpresult /r /scope computer`


