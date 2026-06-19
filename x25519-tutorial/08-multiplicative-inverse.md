# 第8章：乘法逆元

## 8.1 概述

乘法逆元是有限域中除法运算的基础。本章介绍如何使用费马小定理计算乘法逆元。

## 8.2 费马小定理

### 定理

如果 $p$ 是素数且 $a \not\equiv 0 \pmod{p}$，则：

$$a^{p-1} \equiv 1 \pmod{p}$$

### 推论

由费马小定理可得：

$$a \cdot a^{p-2} \equiv a^{p-1} \equiv 1 \pmod{p}$$

因此，$a$ 的乘法逆元为：

$$a^{-1} \equiv a^{p-2} \pmod{p}$$

## 8.3 平方-乘法算法

### 算法原理

计算 $a^{p-2}$ 需要进行 $p-2$ 次乘法，这太慢了。平方-乘法算法可以将复杂度降低到 $O(\log(p))$。

### 递归关系

$$a^{2i} = a^i \cdot a^i$$
$$a^{2i+1} = a \cdot a^i \cdot a^i$$

### 算法步骤

1. 将指数 $p-2$ 表示为二进制
2. 从最高位开始，对每一位：
   - 平方当前结果
   - 如果当前位为 1，乘以 $a$

## 8.4 finverse 函数实现

```c
static void finverse(field_elem out, const field_elem in)
{
    field_elem c;
    int i;
    
    // 初始化 c = in
    for (i = 0; i < 16; ++i) c[i] = in[i];
    
    // 计算 in^(p-2) 使用平方-乘法算法
    // p-2 = 2^255 - 21 的二进制表示
    // 从第 253 位开始（因为 c 初始化为 in，而不是 1）
    for (i = 253; i >= 0; i--) {
        // 平方
        fmul(c, c, c);
        
        // 如果当前位为 1，乘以 in
        // p-2 的第 2 位和第 4 位为 0，其他位为 1
        if (i != 2 && i != 4) {
            fmul(c, c, in);
        }
    }
    
    // 复制结果
    for (i = 0; i < 16; ++i) out[i] = c[i];
}
```

## 8.5 为什么从第 253 位开始

### p-2 的二进制表示

$$p - 2 = 2^{255} - 21$$

二进制表示为：111...11101011（255 位，第 2 位和第 4 位为 0）

### 优化

因为 c 初始化为 in（而不是 1），我们可以：

1. 从第 253 位开始（而不是 254 位）
2. 节省一次迭代

### 为什么第 2 位和第 4 位为 0

$$p - 2 = 2^{255} - 21 = 2^{255} - 16 - 4 - 1$$

二进制表示中：
- 第 0 位：1（因为 $-1$）
- 第 2 位：0（因为 $-4$ 抵消了）
- 第 4 位：0（因为 $-16$ 抵消了）
- 其他位：1

## 8.6 常数时间实现

### 为什么需要常数时间

如果执行时间依赖于秘密值（如私钥），攻击者可能通过时间攻击恢复私钥。

### 实现策略

1. **无分支**：避免使用 if 语句
2. **固定迭代**：总是执行相同的循环次数
3. **无数据依赖**：执行时间不依赖于输入值

### 当前实现的常数时间性

```c
if (i != 2 && i != 4) {
    fmul(c, c, in);
}
```

这个 if 语句是安全的，因为：
- 条件只依赖于循环变量 i，不依赖于秘密值
- i 是公开的，不是秘密

## 8.7 完整代码示例

```c
#include <stdio.h>

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

// 乘法实现
static void fmul(field_elem out, const field_elem a, const field_elem b)
{
    i64 i, j, product[31];
    
    for (i = 0; i < 31; ++i) product[i] = 0;
    
    for (i = 0; i < 16; ++i) {
        for (j = 0; j < 16; ++j) {
            product[i+j] += a[i] * b[j];
        }
    }
    
    for (i = 0; i < 15; ++i) {
        product[i] += 38 * product[i + 16];
    }
    
    for (i = 0; i < 16; ++i) {
        out[i] = product[i];
    }
    
    carry25519(out);
    carry25519(out);
}

// 乘法逆元实现
static void finverse(field_elem out, const field_elem in)
{
    field_elem c;
    int i;
    
    for (i = 0; i < 16; ++i) c[i] = in[i];
    
    for (i = 253; i >= 0; i--) {
        fmul(c, c, c);
        if (i != 2 && i != 4) {
            fmul(c, c, in);
        }
    }
    
    for (i = 0; i < 16; ++i) out[i] = c[i];
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

// pack25519 实现（简化版）
static void pack25519(u8 *out, const field_elem in)
{
    // 简化实现，实际需要更复杂的归约
    int i;
    field_elem t;
    for (i = 0; i < 16; ++i) t[i] = in[i];
    carry25519(t); carry25519(t); carry25519(t);
    
    for (i = 0; i < 16; ++i) {
        out[2*i] = t[i] & 0xff;
        out[2*i + 1] = t[i] >> 8;
    }
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
    // 示例：计算 2 的乘法逆元
    u8 two_bytes[32] = {2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    
    field_elem a, inv_a, product;
    unpack25519(a, two_bytes);
    
    printf("计算 2 的乘法逆元:\n");
    print_field_elem("a", a);
    
    finverse(inv_a, a);
    print_field_elem("inv_a", inv_a);
    
    // 验证：a * inv_a 应该等于 1
    fmul(product, a, inv_a);
    print_field_elem("a * inv_a", product);
    
    return 0;
}
```

## 8.8 性能分析

### 时间复杂度

- 平方-乘法算法：$O(\log(p))$ 次乘法
- 每次乘法：$O(1)$（固定 256 次迭代）
- 总复杂度：$O(\log(p))$

### 空间复杂度

- 需要额外的 field_elem 变量
- 总空间：$O(1)$

## 8.9 练习

1. 实现 finverse 函数，并验证其正确性。
2. 解释为什么需要从第 253 位开始。
3. 分析乘法逆元的时间复杂度。
4. 设计一个测试用例，验证乘法逆元的正确性。

## 8.10 小结

乘法逆元是有限域除法的基础。通过使用费马小定理和平方-乘法算法，我们可以高效地计算乘法逆元。

在下一章中，我们将实现打包和解包函数，完成有限域算术的实现。