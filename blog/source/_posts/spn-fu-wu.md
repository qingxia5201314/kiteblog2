---
title: 'SPN与服务账号'
date: 2026-07-10T11:23:58.783Z
updated: 2026-07-10T11:32:23.497Z
categories: ['notes']
tags: ['内网渗透']
cover: /media/migrated/img-5d4a4805-62b0-4773-8556-f0518c448f3d.png
---
> SPN服务主体名称，作用：`在Kerberos里唯一标识一个服务实例`

## 为什么需要SPN

当访问共享文件时，客户端需要告诉KDC访问DC01上的SMB文件共享服务，在Kerberos里，这个服务通常表示成：`cifs/DC01`,`cifs/DC01.corp.local`,这就是SPN，也就是说：

`SPN=服务类型/服务所在主机名`

常见形式：

```
service-class/host 
service-class/host:post
```

## 常见SPN类型


![image.png](/media/migrated/img-5244adee-970e-43c3-aad7-d8aeec070303.png)

## SPN和Kerberos的关系



![image.png](/media/migrated/img-ef4bc57a-816e-456b-a69d-23da9bb7faec.png)


## **SPN绑定在哪个账号上**

在AD中，SPN是某个账号对象的属性：`servicePrincipalName`

这个账号可以是：

```
计算机账号
用户账号
托管服务账号
```



![image.png](/media/migrated/img-ca8c66d9-0a03-4fa6-b597-75e569a22e24.png)

5. 怎么看SPN？


![image.png](/media/migrated/img-7e9dd602-d488-4fe5-aacd-286890c2162f.png)

6. 给实验服务账号添加一个SPN


![image.png](/media/migrated/img-06e1d725-cf90-49c0-bc56-072ff561718b.png)



![image.png](/media/migrated/img-6ebbcf1a-c95e-4d6a-9512-eaf97e6f5379.png)

7. 客户端怎么观察SPN票据

通过klist来看，如果SPN请求KDC获得服务器票据，那么就可以看到SPN票据

8. 内网渗透视角来看

SPN的价值在于：

```
域里有哪些服务？
这些服务由哪些账号运行？
服务账号可能拥有哪些权限？
哪些用户账号配置了 SPN？
这些账号是不是服务账号？
这些服务账号是否属于高权限组？
服务账号密码是否长期不变？
服务账号是否被过度授权？
```
