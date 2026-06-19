# 第5章：数据表示

## 5.1 概述

在实现 Curve25519 时，我们需要高效地表示和操作 255 位的整数。本章介绍两种主要的数据表示方式。

## 5.2 字节数组表示

### 定义

使用 32 字节（256 位）的数组表示一个 255 位的整数，采用小端序（little-endian）。

### 结构

```c
typedef unsigned char u8;

// 32 字节表示
u8 bytes[32];

// bytes[0] 包含最低有效字节
// bytes[31] 包含最高有效字节
```

### 示例

数字 1 的字节表示：

```c
u8 one_bytes[32] = {1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
```

### 优点

1. **标准化**：便于网络传输和存储
2. **兼容性**：与其他加密库兼容
3. **简单性**：易于理解和调试

## 5.3 field_elem 表示

### 定义

使用 16 个 64 位整数的数组表示一个 255 位的整数，每个元素存储 16 位。

### 结构

```c
typedef long long i64;
typedef i64 field_elem[16];

// field_elem[0] 包含最低 16 位
// field_elem[15] 包含最高 16 位
```

### 数学表示

一个 field_elem 数组 $(a_0, a_1, \ldots, a_{15})$ 表示数字：

$$a = a_0 \cdot 2^0 + a_1 \cdot 2^{16} + a_2 \cdot 2^{32} + \cdots + a_{15} \cdot 2^{240}$$

### 为什么使用 64 位整数

虽然每个元素只需要 16 位，但使用 64 位整数有以下好处：

1. **避免溢出**：中间计算结果可能超过 16 位
2. **简化代码**：不需要频繁处理进位
3. **性能优化**：现代 CPU 对 64 位运算优化更好

## 5.4 转换函数：unpack25519

### 功能

将 32 字节数组转换为 field_elem 表示。

### 实现

```c
static void unpack25519(field_elem out, const u8 *in)
{
    int i;
    for (i = 0; i < 16; ++i) {
        out[i] = in[2*i] + ((i64) in[2*i + 1] << 8);
    }
    out[15] &= 0x7fff;  // 确保最高位为 0（255 位限制）
}
```

### 工作原理

1. **字节组合**：将两个相邻字节组合成一个 16 位值
   - `in[2*i]`：低字节
   - `in[2*i + 1]`：高字节（左移 8 位）

2. **最高位处理**：`out[15] &= 0x7fff` 确保只有 15 位有效
   - 因为数字最大为 $2^{255} - 1$，第 255 位（从 0 开始计数）必须为 0

### 示例

```c
u8 bytes[32] = {0xed, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
                0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
                0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
                0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f};
field_elem fe;

unpack25519(fe, bytes);
// fe[0] = 0xffed (因为 0xed + (0xff << 8) = 0xffed)
// fe[15] = 0x7fff (因为 0x7f + (0xff << 8) = 0x7fff，再 & 0x7fff)
```

## 5.5 转换函数：pack25519

### 功能

将 field_elem 表示转换为 32 字节数组。

### 实现

```c
static void pack25519(u8 *out, const field_elem in)
{
    int i, j, carry;
    field_elem m, t;
    
    // 复制并归约
    for (i = 0; i < 16; ++i) t[i] = in[i];
    carry25519(t); carry25519(t); carry25519(t);
    
    // 模 p 归约
    for (j = 0; j < 2; ++j) {
        m[0] = t[0] - 0xffed;
        for(i = 1; i < 15; i++) {
            m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1);
            m[i - 1] &= 0xffff;
        }
        m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
        carry = (m[15] >> 16) & 1;
        m[14] &= 0xffff;
        swap25519(t, m, 1 - carry);
    }
    
    // 转换为字节
    for (i = 0; i < 16; ++i) {
        out[2*i] = t[i] & 0xff;
        out[2*i + 1] = t[i] >> 8;
    }
}
```

### 工作原理

1. **归约**：调用 carry25519 三次，确保所有元素在 $[0, 2^{16} - 1]$ 范围内
2. **模 p 归约**：计算 $t - p$ 和 $t - 2p$，选择非负结果
3. **字节拆分**：将每个 16 位元素拆分为两个字节

## 5.6 进位处理：carry25519

### 功能

将 field_elem 的每个元素归约到 $[0, 2^{16} - 1]$ 范围。

### 实现

```c
static void carry25519(field_elem elem)
{
    int i;
    i64 carry;
    for (i = 0; i < 16; ++i) {
        carry = elem[i] >> 16;
        elem[i] -= carry << 16;
        if (i < 15) elem[i + 1] += carry;
        else elem[0] += 38 * carry;
    }
}
```

### 工作原理

1. **提取进位**：`carry = elem[i] >> 16` 获取高 48 位
2. **移除进位**：`elem[i] -= carry << 16` 保留低 16 位
3. **传播进位**：
   - 如果不是最后一个元素：加到下一个元素
   - 如果是最后一个元素：乘以 38 后加到第一个元素（模 $2p$ 归约）

### 为什么乘以 38

因为 $2^{256} = 2p + 38$，所以：

$$2^{256} \equiv 38 \pmod{2p}$$

当最高位有进位时，相当于加上 $2^{256}$，需要转换为加上 38。

## 5.7 代码示例

```c
#include <stdio.h>
#include <string.h>

typedef unsigned char u8;
typedef long long i64;
typedef i64 field_elem[16];

// unpack25519 实现
static void unpack25519(field_elem out, const u8 *in)
{
    int i;
    for (i = 0; i < 16; ++i) {
        out[i] = in[2*i] + ((i64) in[2*i + 1] << 8);
    }
    out[15] &= 0x7fff;
}

// carry25519 实现
static void carry25519(field_elem elem)
{
    int i;
    i64 carry;
    for (i = 0; i < 16; ++i) {
        carry = elem[i] >> 16;
        elem[i] -= carry << 16;
        if (i < 15) elem[i + 1] += carry;
        else elem[0] += 38 * carry;
    }
}

// 打印 field_elem
void print_field_elem(const field_elem fe)
{
    printf("field_elem: ");
    for (int i = 0; i < 16; i++) {
        printf("%04llx ", fe[i]);
    }
    printf("\n");
}

int main()
{
    // 示例：数字 1 的字节表示
    u8 one_bytes[32] = {1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    
    field_elem fe;
    unpack25519(fe, one_bytes);
    
    printf("数字 1 的 field_elem 表示：\n");
    print_field_elem(fe);
    
    // 示例：数字 0 的字节表示
    u8 zero_bytes[32] = {0};
    unpack25519(fe, zero_bytes);
    
    printf("数字 0 的 field_elem 表示：\n");
    print_field_elem(fe);
    
    return 0;
}
```

## 5.8 练习

1. 实现 pack25519 函数。
2. 解释为什么 unpack25519 需要 `out[15] &= 0x7fff`。
3. 验证 carry25519 函数的正确性。
4. 解释为什么需要调用 carry25519 三次而不是一次。

## 5.9 小结

数据表示是实现高效密码学运算的关键。通过使用 field_elem 表示，我们可以方便地进行大数运算，同时保持代码的简洁和高效。

在下一章中，我们将实现有限域的加法和减法运算。