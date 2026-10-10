---
title: '逆向花指令转稿'
date: 2026-09-17T01:01:36.463Z
updated: 2026-09-17T01:02:31.463Z
categories: ['notes']
tags: []
cover: notes
---
# CTF逆向Reverse 花指令介绍 and NSSCTF靶场入门题目复现

> 原文链接：https://blog.csdn.net/Sciurdae/article/details/133750478

## 前言

本博客是参考了诸多大佬的文章而成的，博主本人也是菜鸟，可以看作是博主的学习笔记，因此我也会尽量写的详细，希望可以对你（萌新）有所帮助。

## 简介

**花指令**又名垃圾代码、脏字节，英文名是 **junk code**。花指令就是在不影响程序运行的情况下，往真实代码中插入一些垃圾代码，从而影响反汇编器的正常运行；或是起到干扰逆向分析人员的静态分析，增加分析难度和分析时间。

有句话，**花指令的目的是阻挠逆向人员的分析，并不是阻止**。因此，我们在去除花指令的时候，要有耐心，因为这应该不会是什么难点，慢慢来一定可以解决的。

## 简单花指令

花指令分为两种：

- **不可执行花指令**
- **可执行花指令**

### 可执行花指令

顾名思义，可以执行的花指令，这部分垃圾代码会在程序运行的时候执行，但是执行这些指令没有任何意义，并不会改变寄存器的值，同时反汇编器也可以正常的反汇编这些指令。目的是为了增加静态分析的难度，加大逆向分析人员的工作量。

### 不可执行花指令

不可以执行的花指令，这类花指令会使反编译器在反编译的时候出错，反汇编器可能错误的反汇编这些指令。根据反汇编的工作原理，只有花指令同正常指令的前几个字节被反汇编器识别成一组无用字节时，才能破坏反汇编的结果。因此，插入的花指令应当是一些不完整的指令，被插入的不完整指令可以是随机选择的。

为了能够有效迷惑反汇编器，同时又确保代码的正确运行，花指令必须满足两个基本特征，即：

- **垃圾数据必须是某个合法指令的一部分。**
- **程序运行时，花指令必须位于实际不可执行的代码路径。**

## 原理：反汇编算法的设计缺陷

反汇编算法主要可以分为两类：**递归下降算法**和**线性扫描算法**。

### 1）线性扫描算法

线性扫描算法从程序的入口点开始反汇编，然后对整个代码段进行扫描，反汇编扫描过程中所遇到的每条指令。线性扫描算法的缺点在于在冯诺依曼体系结构下，**无法区分数据与代码**，从而导致将代码段中嵌入的数据误解释为指令的操作码，以致最后得到错误的反汇编结果。

### 2）递归下降算法

递归下降采取另外一种不同的方法来定位指令。递归下降算法强调控制流的概念。控制流根据一条指令是否被另一条指令引用来决定是否对其进行反汇编，遇到非控制转移指令时顺序进行反汇编，而遇到控制转移指令时则从转移地址处开始进行反汇编。通过构造**必然条件**或者**互补条件**，使得反汇编出错。

## 关于花指令的构造

### 永恒跳转

#### 最简单的jmp指令

```asm
jmp LABEL1
db junk_code  ;
LABEL1:
```

这种jmp单次跳转只能骗过线性扫描算法，会被IDA识别（递归下降）。

#### 多层跳转

```c
__asm {
    jmp LABEL1;
    _emit 68h;
LABEL1:
    jmp LABEL2;
    _emit 0CDh;
    _emit 20h;
LABEL2:
    jmp LABEL3;
    _emit 0E8h;
LABEL3:
}
```

和单次跳转一样，这种也会被IDA识别。

为了骗过IDA，我们将上面的花指令改写一下：

```c
__asm {
    _emit 0xE8
    _emit 0xFF
    //_emit 立即数：代表在这个位置插入一个数据，这里插入的是0xe8
}
```

查看反汇编后的结果：

![IDA错误识别](https://i-blog.csdnimg.cn/blog_migrate/f846bd379da3c942705b7884ae0ccb8e.png)

可以看到IDA错误的识别loc_411877处的代码，成功的实现了花指令的目的。那么我们知道了如何构造，自然也就明白了如何去除，只需要将插入的立即数nop掉即可，点击0xe8和0xff，点击右键，选择 **patching->change byte**

![修改字节](https://i-blog.csdnimg.cn/blog_migrate/0c8676259a589033fe49e407dde3f2a1.png)

也可以使用一个idapython脚本添加一个快捷键：

```python
from idaapi import *
from idc import *

def nopIt():
    start = get_screen_ea()
    patch_byte(start, 0x90)
    refresh_idaview_anyway()

add_hotkey("ctrl-N", nopIt)
```

这个快捷键可以将选中的地方直接nop掉。（不太清楚，我看别的文章都是说可以直接ctrl+n，我没有找到/(ㄒoㄒ)/~~）（虽然这个脚本也是从别人文章扒的h）

![IDAPython脚本](https://i-blog.csdnimg.cn/blog_migrate/c35c2203044e2dd755c4d90d88cfe846.png)

idapython在 **File - Script commannd…** 处 也可以 **Shift+F2** 快捷键打开。

![打开IDAPython](https://i-blog.csdnimg.cn/blog_migrate/62af8fbe74de5bdaf2b413041c40364c.png)

idapython需要python环境，未安装的萌新请自行搜索安装。

### 其它构造形式

#### jnz和jz互补跳转

```c
__asm {
    jz Label;
    jnz Label;
    _emit 0xC7;
Label:
}
```

![互补跳转](https://i-blog.csdnimg.cn/blog_migrate/098cba6439c936b17e6939ff2cd3779d.png)

这种混淆去除方式也很简单，特征也很明显，因为是近跳转，所以ida分析的时候会分析出jz或者jnz会跳转几个**字节**，这个时候我们就可得到垃圾数据的长度，将该长度字节的数据全部nop掉即可解混淆。

#### 跳转指令构造花指令

```c
__asm {
    push ebx;
    xor ebx, ebx;
    test ebx, ebx;
    jnz LABEL7;
    jz    LABEL8;
LABEL7:
    _emit 0xC7;
LABEL8:
    pop ebx;
}
```

![条件跳转](https://i-blog.csdnimg.cn/blog_migrate/5fca7fd051dfd49f9f937745eae93603.png)

很明显，先对ebx进行xor之后，再进行test比较，zf标志位肯定为1，就肯定执行jz LABEL8，也就是说中间0xC7永远不会执行。

不过这种一定要注意：**记着保存ebx的值先把ebx压栈，最后在pop出来。**

解混淆的时候也需要稍加注意，需要分析一下哪里是真正会跳到的位置，然后将垃圾数据nop掉，本质上和前面几种没什么不同。

#### call&ret构造花指令

```c
__asm {
    call LABEL9;
    _emit 0x83;
LABEL9:
    add dword ptr ss:[esp], 8;
    ret;
    __emit 0xF3;
}
```

![call&ret构造](https://i-blog.csdnimg.cn/blog_migrate/e2018bc62fb04b441992890003dcc4c8.png)

call指令会把下一条指令的地址压栈，然后跳到调用的地址，而ret指令会把栈顶的值弹出，然后跳到该地址。所以这里通过修改栈顶的值（add dword ptr ss:[esp], 8），跳过了0x83和0xF3这两个垃圾字节。

![反汇编效果](https://i-blog.csdnimg.cn/blog_migrate/0f1aa7a0085f7a4b168ea2c40d5573f4.png)

## 一点话

花指令的构造方式还有很多，这里只是列举了一些常见的。关键在于理解原理，然后灵活运用。

去除花指令的时候，要有耐心，慢慢分析，找出垃圾数据，然后nop掉即可。

## CTF练习

### [HNCTF 2022 WEEK2]e@sy_flower

![题目1](https://i-blog.csdnimg.cn/blog_migrate/3de943dda7fb52e3703ec04d0282f59a.png)

![题目1-2](https://i-blog.csdnimg.cn/blog_migrate/a451edc56a9eb48ba2b509ad26bdea26.png)

![题目1-3](https://i-blog.csdnimg.cn/blog_migrate/810abdf4b978d250d7525d161d8a842f.png)

### [NSSRound#3 Team]jump_by_jump

![题目2](https://i-blog.csdnimg.cn/blog_migrate/6f25bc49e0ea88c63822a7b39455875c.png)

![题目2-2](https://i-blog.csdnimg.cn/blog_migrate/083641aa50d3271aa6c8e841cdf8f16e.png)

### [NSSRound#3 Team]jump_by_jump_revenge

![题目3](https://i-blog.csdnimg.cn/blog_migrate/17146b8426a02b061d4c446d5077a8cb.png)

![题目3-2](https://i-blog.csdnimg.cn/blog_migrate/8ce5a725247c66b201e899d38b67d0ad.png)

![题目3-3](https://i-blog.csdnimg.cn/blog_migrate/6dc222063318d066d3c6e2b9d39ecddd.png)

### [MoeCTF 2022]chicken_soup

![题目4](https://i-blog.csdnimg.cn/blog_migrate/a5f4e9cfdafeda2c2057fa17da8a9217.png)

![题目4-2](https://i-blog.csdnimg.cn/blog_migrate/f062769ac389153e6051d3d08800579f.png)

![题目4-3](https://i-blog.csdnimg.cn/blog_migrate/99e8ae7aa3ada893d31802eecd32a27f.png)

![题目4-4](https://i-blog.csdnimg.cn/blog_migrate/d0e5646e10d73d431b9427e83fd57220.png)

![题目4-5](https://i-blog.csdnimg.cn/blog_migrate/bd5f0359e2afb349d7fc29f5922dc946.png)

![题目4-6](https://i-blog.csdnimg.cn/blog_migrate/d33af2ca73e71b7844e6c142bdc7cfe8.png)

![题目4-7](https://i-blog.csdnimg.cn/blog_migrate/671a985911b010355142ed70ecf998a4.png)

![题目4-8](https://i-blog.csdnimg.cn/blog_migrate/0f91bd20596842158b42911cf3608531.png)

![题目4-9](https://i-blog.csdnimg.cn/blog_migrate/ff661708dde306369696c8ade22cdfef.png)

![题目4-10](https://i-blog.csdnimg.cn/blog_migrate/0969d64a37138ae64ce7497b881dc3ee.png)

## 后言

花指令是CTF逆向中常见的混淆技术，掌握其原理和去除方法对于逆向分析非常重要。

---

## 总结要点

### 核心概念
- 花指令 = 垃圾代码 = 脏字节 = junk code
- 目的：阻挠而非阻止逆向分析
- 两大类型：可执行花指令、不可执行花指令

### 关键原理
- 利用反汇编算法的设计缺陷
- 线性扫描算法：无法区分代码和数据
- 递归下降算法（IDA）：通过构造必然/互补条件使其出错

### 常见构造方式
1. **_emit 指令插入**：最有效
2. **JZ/JNZ 互补跳转**：无论条件都会跳转到同一位置
3. **必然条件跳转**：XOR后TEST必然为0
4. **CALL&RET 构造**：修改栈顶返回地址

### 去除方法
1. **手动方法**：
   - 分析跳转逻辑，识别垃圾字节
   - 右键 → Patching → Change Byte → 改为 0x90 (NOP)
   - 按 **P** 键重新创建函数

2. **IDAPython 脚本**：
   - Shift+F2 打开脚本窗口
   - 使用 patch_byte() 函数批量处理
   - 添加快捷键提高效率

### 重要提醒
- 保持耐心，花指令不是难点
- 理解原理比记忆模式更重要
- 实践是最好的学习方式

