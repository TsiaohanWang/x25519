# 第9章：打包和解包

## 9.1 概述

打包和解包函数是有限域算术的最后一步，它们实现了字节数组和 field_elem 表示之间的转换。

## 9.2 解包函数：unpack25519

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
    out[15] &= 0x7fff;
}
```

### 工作原理

1. **字节组合**：将两个相邻字节组合成一个 16 位值
   - `in[2*i]`：低字节
   - `in[2*i + 1]`：高字节（左移 8 位）

2. **最高位处理**：`out[15] &= 0x7fff` 确保只有 15 位有效
   - 因为数字最大为 $2^{255} - 1$，第 255 位必须为 0

### 示例

```c
u8 bytes[32] = {0xed, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
                0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
                0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
                0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f};
field_elem fe;

unpack25519(fe, bytes);
// fe[0] = 0xffed
// fe[15] = 0x7fff
```

## 9.3 打包函数：pack25519

### 功能

将 field_elem 表示转换为 32 字节数组，同时进行模 $p$ 归约。

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

## 9.4 模 p 归约

### 为什么需要归约

field_elem 表示的数可能在 $[0, 2^{256} - 1]$ 范围内，需要归约到 $[0, p-1]$。

### 三种情况

1. $0 \leq t < p$：已经归约，无需处理
2. $p \leq t < 2p$：需要减去 $p$
3. $2p \leq t < 2^{256}$：需要减去 $2p$

### 常数时间实现

不能使用条件分支，必须计算所有可能的结果，然后选择正确的。

## 9.5 swap25519 函数

### 功能

常数时间地交换两个 field_elem 的值。

### 实现

```c
static void swap25519(field_elem p, field_elem q, int bit)
{
    i64 t, i, c = ~(bit - 1);
    for (i = 0; i < 16; ++i) {
        t = c & (p[i] ^ q[i]);
        p[i] ^= t;
        q[i] ^= t;
    }
}
```

### 工作原理

1. **生成掩码**：`c = ~(bit - 1)`
   - 如果 bit = 0：c = 0
   - 如果 bit = 1：c = 0xFF...FF

2. **条件交换**：
   - 如果 c = 0：t = 0，不交换
   - 如果 c = 1：t = p[i] ^ q[i]，交换

## 9.6 完整代码示例

```c
#include <stdio.h>
#include <string.h>

typedef unsigned char u8;
typedef long long i64;
typedef i64 field_elem[16];

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

// swap25519 实现
static void swap25519(field_elem p, field_elem q, int bit)
{
    i64 t, i, c = ~(bit - 1);
    for (i = 0; i < 16; ++i) {
        t = c & (p[i] ^ q[i]);
        p[i] ^= t;
        q[i] ^= t;
    }
}

// unpack25519 实现
static void unpack25519(field_elem out, const u8 *in)
{
    int i;
    for (i = 0; i < 16; ++i) {
        out[i] = in[2*i] + ((i64) in[2*i + 1] << 8);
    }
    out[15] &= 0x7fff;
}

// pack25519 实现
static void pack25519(u8 *out, const field_elem in)
{
    int i, j, carry;
    field_elem m, t;
    
    for (i = 0; i < 16; ++i) t[i] = in[i];
    carry25519(t); carry25519(t); carry25519(t);
    
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
    
    for (i = 0; i < 16; ++i) {
        out[2*i] = t[i] & 0xff;
        out[2*i + 1] = t[i] >> 8;
    }
}

// 打印字节数组
void print_bytes(const char *name, const u8 *bytes, int len)
{
    printf("%s: ", name);
    for (int i = 0; i < len; i++) {
        printf("%02x", bytes[i]);
    }
    printf("\n");
}

// 打印 field_elem
void print_field_elem(const char *name, const field_elem fe)
{
    printf("%s: ", name);
    for (int i = 0; i < 16; i++) {
        printf("%04llx ", fe[i] & 0xffff);
    }
    printf("\n");
}

int main()
{
    // 示例：数字 1 的打包和解包
    u8 one_bytes[32] = {1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    
    field_elem fe;
    u8 packed[32];
    
    printf("数字 1 的打包和解包:\n");
    print_bytes("原始字节", one_bytes, 32);
    
    unpack25519(fe, one_bytes);
    print_field_elem("解包后", fe);
    
    pack25519(packed, fe);
    print_bytes("打包后", packed, 32);
    
    // 验证打包和解包是互逆操作
    if (memcmp(one_bytes, packed, 32) == 0) {
        printf("验证成功：打包和解包是互逆操作\n");
    } else {
        printf("验证失败\n");
    }
    
    return 0;
}
```

## 9.7 常数时间性分析

### unpack25519

- **无分支**：代码中没有条件分支
- **固定迭代**：总是执行 16 次循环
- **常数时间**：✅

### pack25519

- **无秘密依赖分支**：所有条件都依赖于公开值
- **固定迭代**：总是执行相同的循环次数
- **常数时间**：✅

### swap25519

- **无分支**：使用位运算实现条件交换
- **固定迭代**：总是执行 16 次循环
- **常数时间**：✅

## 9.8 练习

1. 实现 unpack25519 和 pack25519 函数。
2. 解释为什么 pack25519 需要调用 carry25519 三次。
3. 分析 swap25519 函数的工作原理。
4. 设计测试用例，验证打包和解包的正确性。

## 9.9 小结

打包和解包函数完成了有限域算术的实现。通过这些函数，我们可以在字节数组和 field_elem 表示之间进行转换，为后续的椭圆曲线运算做好准备。

在下一章中，我们将开始实现椭圆曲线运算。