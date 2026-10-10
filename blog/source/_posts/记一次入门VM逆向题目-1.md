title: 记一次入门VM逆向题目
author: Kitepop
tags:
  - 入门
categories:
  - 逆向工程
  - CTF
date: 2026-10-09 06:11:00
---
# 思路

首先打开后看逻辑发现是22字符

![upload successful](/api/files/raw/file-cf561e30-656a-4472-8edd-1c3dc57fc4e9?token=mi_rO7uhqv1WZjQbo22586yy0-VmEDhU05UCuoLjalI)

继续往下面看

![upload successful](/api/files/raw/file-d670ec74-8e43-4149-a56a-5390f32a1cf6?token=JDqKb1HxiDhsxPSyonMBYfQFmwA_AjCF-ZjJVKFhCnQ)
这里有一个opcode，跟一下是字节码

`opencode:01 03 03 02 01 05 03 03 02 01 01 02 03 02 03 04 01 02 03 04 01 03`

> 后面有一个strcmp比较，密文提取出来就是

` 密文:01 03 17 8E 78 5A 15 53 0C 66 7D 46 0C DA 3A`

## 加密逻辑


![upload successful](/api/files/raw/file-2484889f-3306-4cfd-913c-628b12f65555?token=oJRS-dt8CjRinJORdmXISfQAUZTBmOpTsEOXjxriDuw)

- 这里就是取opcode里面的值来对应每个功能
- 然后+、-、*、//

然后写解密脚本就可以了

```python
enc = [0x67, 0x29, 0x29, 0x2A, 0x6D, 0x46, 0x01, 0x03, 0x17, 0x8E, 
  0x78, 0x5A, 0x15, 0x53, 0x0C, 0x66, 0x7D, 0x46, 0x0C, 0xDA, 
  0x3A]

opcode = [0x01, 0x03, 0x03, 0x02, 0x01, 0x05, 0x03, 0x03, 0x02, 0x01, 
  0x01, 0x02, 0x03, 0x02, 0x03, 0x04, 0x01, 0x02, 0x03, 0x04, 
  0x01, 0x03]

for i in range(len(enc)):
    if opcode[i] == 1:
        enc[i] -= 25

    elif opcode[i] == 2:
        enc[i] += 25

    elif opcode[i] == 3:
        enc[i] ^= 0x7A

    elif opcode[i] == 4:
        enc[i] //= 2

print(enc)
print(''.join([chr(x) for x in enc]))
```

# 总结

就是用字节码来对应加密的过程，然后再复原即可