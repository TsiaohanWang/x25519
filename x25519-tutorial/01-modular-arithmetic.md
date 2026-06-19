# 第1章：模运算基础

## 1.1 什么是模运算

模运算是椭圆曲线密码学的基础。在计算机中，我们经常需要处理固定范围内的数值，模运算正好提供了这种能力。

### 定义

对于整数 $a$ 和正整数 $n$，$a$ 模 $n$ 的结果是 $a$ 除以 $n$ 后的余数，记作 $a \mod n$ 或 $a \pmod{n}$。

形式化定义：对于整数 $a$ 和正整数 $n$，存在唯一的整数 $q$（商）和 $r$（余数），使得：

$$a = q \cdot n + r, \quad 0 \leq r < n$$

其中 $r$ 就是 $a \mod n$。

### 示例

```
7 mod 3 = 1    (因为 7 = 2 × 3 + 1)
10 mod 4 = 2   (因为 10 = 2 × 4 + 2)
15 mod 5 = 0   (因为 15 = 3 × 5 + 0)
```

## 1.2 同余关系

### 定义

两个整数 $a$ 和 $b$ 在模 $n$ 下同余，当且仅当它们除以 $n$ 的余数相同。记作：

$$a \equiv b \pmod{n}$$

这意味着存在整数 $k$，使得 $a - b = k \cdot n$。

### 示例

```
17 ≡ 5 (mod 6)    (因为 17 - 5 = 12 = 2 × 6)
23 ≡ 3 (mod 10)   (因为 23 - 3 = 20 = 2 × 10)
-7 ≡ 1 (mod 4)    (因为 -7 - 1 = -8 = -2 × 4)
```

## 1.3 模运算的性质

### 基本性质

1. **加法性质**：$(a + b) \mod n = ((a \mod n) + (b \mod n)) \mod n$
2. **减法性质**：$(a - b) \mod n = ((a \mod n) - (b \mod n) + n) \mod n$
3. **乘法性质**：$(a \cdot b) \mod n = ((a \mod n) \cdot (b \mod n)) \mod n$
4. **幂运算性质**：$a^k \mod n$ 可以通过重复平方法高效计算

### 代码示例

```c
#include <stdio.h>

// 基本模运算
int mod_add(int a, int b, int n) {
    return ((a % n) + (b % n)) % n;
}

int mod_sub(int a, int b, int n) {
    return ((a % n) - (b % n) + n) % n;
}

int mod_mul(int a, int b, int n) {
    return ((a % n) * (b % n)) % n;
}

// 快速幂模运算
int mod_pow(int base, int exp, int n) {
    int result = 1;
    base = base % n;
    
    while (exp > 0) {
        if (exp % 2 == 1) {
            result = (result * base) % n;
        }
        exp = exp >> 1;
        base = (base * base) % n;
    }
    
    return result;
}

int main() {
    int n = 7;
    
    printf("模 %d 运算示例：\n", n);
    printf("5 + 4 mod %d = %d\n", n, mod_add(5, 4, n));
    printf("5 - 4 mod %d = %d\n", n, mod_sub(5, 4, n));
    printf("5 * 4 mod %d = %d\n", n, mod_mul(5, 4, n));
    printf("2^10 mod %d = %d\n", n, mod_pow(2, 10, n));
    
    return 0;
}
```

## 1.4 模运算在密码学中的应用

### 固定长度表示

在密码学中，我们经常需要将大数表示为固定长度的比特串。模运算允许我们：

1. 将任意整数映射到固定范围 $[0, p-1]$
2. 确保运算结果仍在同一范围内
3. 防止数值溢出

### Curve25519 中的模数

Curve25519 使用的模数是：

$$p = 2^{255} - 19$$

这是一个素数，其十六进制表示为：

```
0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed
```

选择这个素数的原因：
1. 接近 2 的幂，便于高效实现
2. 是素数，确保有限域的性质
3. 255 位长度，适合 32 字节表示

## 1.5 练习

1. 计算以下模运算：
   - $23 \mod 7$
   - $100 \mod 13$
   - $2^{10} \mod 11$

2. 验证同余关系：
   - $17 \equiv 3 \pmod{7}$
   - $42 \equiv 0 \pmod{6}$

3. 实现一个函数，计算 $a^b \mod n$，其中 $a, b, n$ 都是 32 位整数。

## 1.6 小结

模运算是椭圆曲线密码学的基石。通过模运算，我们可以在有限域中进行算术运算，这是实现 Curve25519 的第一步。

在下一章中，我们将学习群论基础，了解如何在模运算的基础上构建更复杂的数学结构。