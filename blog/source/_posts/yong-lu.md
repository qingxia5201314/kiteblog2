---
title: '用组控制共享目录访问'
date: 2026-07-10T03:04:38.995Z
updated: 2026-07-10T03:20:50.166Z
categories: ['notes']
tags: ['内网渗透']
cover: /media/migrated/img-92979c0e-3f57-4233-b84a-c9333be265f8.png
---
```
目标：
alice 属于 IT-Users -> 可以访问 \\DC01\IT-Share
bob 不属于 IT-Users -> 不能访问 \\DC01\IT-Share
```

1. 在 DC01 创建目录

在 DC01 上打开 PowerShell：

New-Item -ItemType Directory -Path "C:\Shares\IT-Share"

创建一个测试文件：

Set-Content -Path "C:\Shares\IT-Share\readme.txt" -Value "This is IT share."

2. 创建共享

继续在 DC01 上执行：

New-SmbShare -Name "IT-Share" -Path "C:\Shares\IT-Share" -FullAccess "CORP\Domain 
Admins" -ChangeAccess "CORP\IT-Users"

这表示：

Domain Admins 有完全控制

IT-Users 有修改权限

3. 设置 NTFS 权限

共享权限是一层，NTFS 文件系统权限又是一层。两层都要允许才行。

先关闭继承并清理权限：

icacls "C:\Shares\IT-Share" /inheritance:r

给管理员完全控制：

icacls "C:\Shares\IT-Share" /grant "CORP\Domain Admins:(OI)(CI)F"

给 IT-Users 修改权限：

icacls "C:\Shares\IT-Share" /grant "CORP\IT-Users:(OI)(CI)M"

保留 SYSTEM 权限：

icacls "C:\Shares\IT-Share" /grant "SYSTEM:(OI)(CI)F"

解释一下：

```
(OI) = Object Inherit，文件继承
(CI) = Container Inherit，文件夹继承
F    = Full Control，完全控制
M    = Modify，修改
4. 确认 alice 在 IT-Users
```

DC01 上执行：

Get-ADPrincipalGroupMembership alice | Select Name

如果没有 IT-Users：

Add-ADGroupMember -Identity "IT-Users" -Members alice

5. 确认 bob 不在 IT-Users

Get-ADPrincipalGroupMembership bob | Select Name

如果 bob 在里面，可以移除：

Remove-ADGroupMember -Identity "IT-Users" -Members bob

6. 在客户端用 alice 登录测试

在客户端注销当前用户，然后用：

CORP\alice

登录。

打开窗口 ，输入：

\\DC01\IT-Share

或者如果 DNS 还不稳定，用 IP：

\\192.168.112.132\IT-Share

你应该能打开，并看到：

readme.txt


![image.png](/media/migrated/img-af38a4b4-e1d6-45c5-9eb1-3476a6211139.png)


也可以在 CMD 中测试：

dir \\DC01\IT-Share

7. 在客户端用 bob 登录测试

注销 alice，用：

CORP\bob

登录。

访问：

\\DC01\IT-Share

正常情况下应该访问失败，提示没有权限。


![image.png](/media/migrated/img-8d4059b4-c3b6-4f6b-b96c-d2591a723f20.png)


