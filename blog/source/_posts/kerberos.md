---
title: 'Kerberos认证基础'
date: 2026-07-10T11:11:05.356Z
updated: 2026-07-10T11:11:05.356Z
categories: ['notes']
tags: ['内网渗透']
cover: notes
---
Kerberos是windows域里面最核心的认证协议之一

>用户登录一次后，访问多个域内服务时，不需要反复输入密码

## Kerberos的核心角色 
1. Client 客户端
2. Server 目标服务
3. KDC 密钥分发中心，通常在域控上
4. AS 认证服务，KDC的一部分
5. TGS 票据授予服务，KDC的一部分
6. TGT 票据授予票据
7. Service Ticket 服务票据，用来访问具体服务
8. SPN 服务主题名称

## 当用户登录时Kerberos协议的流程
1. 客户端会向域控请求认证
```
alice 输入密码
客户端用密码派生密钥
向 KDC 请求 TGT
KDC 验证 alice 身份
KDC 返回 TGT
```

`这个 TGT 很重要。它相当于：`

> 我已经通过域控认证，后续可以拿我去换访问具体服务的票据
2. **访问共享时流程**

- 访问 `\\DC01\IT-Share`

`这属于 SMB 服务。客户端不会重新把密码发给 DC01，而是：`

```
客户端拿 TGT 去问 KDC：
我想访问 cifs/DC01.corp.local，请给我服务票据
```

`KDC返回一个`

>Service Ticket

`然后客户端拿这个服务票据访问DC01的SMB服务`

`完整的大致流程就是`

```
登录 alice
-> 获得 TGT
-> 访问 \\DC01\IT-Share
-> 用 TGT 向 KDC 换 cifs/DC01 的服务票据
-> 拿服务票据访问 SMB 服务
-> DC01 根据 alice 的身份和组判断是否允许访问
```

3. 为什么访问控制还要看组


![image.png](/media/migrated/img-e18fd1d3-4f51-4eee-bb47-8f6f1dd51516.png)


4. 用klist观察票据


![image.png](/media/migrated/img-54f592e4-efb2-4176-843a-e5750e38f1b4.png)



![image.png](/media/migrated/img-11bb1317-480d-4b3e-997e-27e540b9957b.png)


