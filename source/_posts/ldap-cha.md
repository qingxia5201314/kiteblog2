---
title: 'LDAP查询与域对象关系'
date: 2026-07-10T02:31:59.175Z
updated: 2026-07-10T03:00:29.610Z
categories: ['notes']
tags: ['内网渗透']
cover: notes
---
**对象 = 类型 + 属性 + 在目录树里的位置**

**DN是对象的完整路径**

>CN=Alice,CN=Users,DC=corp,DC=local

```TXT
CN=Alice        对象名
CN=Users        Users 容器
DC=corp         域名第一段
DC=local        域名第二段
```

则,下面则是LDAP视角里的域根路径

>corp.local = DC=corp,DC=local

## 在DC01上用PowerShell看对象


![image.png](/media/migrated/img-6890e8bc-a6f0-4517-97b4-959f4a368ddd.png)


## LDAP过滤器



![image.png](/media/migrated/img-c599c1f6-0ec0-4641-a83c-3e0b76b971d2.png)


# 组织域

1. 创建组织单位



![image.png](/media/migrated/img-c5a53717-7437-4d81-9fe0-8b2daf4b1f93.png)

2.在Lab-Users创建用户Alice/bob（P@ssw0rd123!）

![image.png](/media/migrated/img-6f5581ff-cbff-42dc-ac31-6973e91bc769.png)




![image.png](/media/migrated/img-ad61a6b9-fce0-4253-bec5-a0a1cd187d73.png)


3.创建服务账号svc_web


![image.png](/media/migrated/img-554cfc68-0dca-49b8-8d48-62da632a6b4f.png)


4.创建组IT-Users


![image.png](/media/migrated/img-cc7ccfd2-02b2-48c7-ab27-5933b5a0b07e.png)

5.创建安全组Web-Admins


![image.png](/media/migrated/img-0d1a4adb-6370-457c-bbec-c08635d1ae7d.png)

6.把alice加入it组



![image.png](/media/migrated/img-7c410d82-83f2-4120-972b-26a2b0804563.png)

7.把svc_web加入Web-Admins

![image.png](/media/migrated/img-5a9f1a85-22c5-4e95-b378-3475a7434695.png)


8.查看配置

![image.png](/media/migrated/img-11dba7e5-621e-467c-9376-08d6f236ba80.png)



![这里的OU就是Lab-Users，memberOf就是IT-Users](/media/migrated/img-bbf3da10-1176-4bf4-80de-9639e546625c.png)



![组成员验证也没问题](/media/migrated/img-b7b4750a-1121-49ad-932f-d4b330c7a915.png)


![可以看到查询的OU出来的有三个成员，对应创建的](/media/migrated/img-d2745a40-c47d-462a-af3e-9c5d1eccc68f.png)




![client也显示加入了IT-Users组](/media/migrated/img-f06321f0-c6b3-4250-b1f9-c2e406394224.png)


