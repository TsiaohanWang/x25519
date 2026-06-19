# 第3章：有限域

## 3.1 域的定义

域是抽象代数中比群更复杂的结构，它支持加法、减法、乘法和除法四种运算。

### 定义

一个域是一个集合 $F$ 加上两个二元运算 $+$ 和 $\cdot$，满足以下公理：

1. $(F, +)$ 是阿贝尔群，单位元记为 0
2. $(F \setminus \{0\}, \cdot)$ 是阿贝尔群，单位元记为 1
3. 乘法对加法满足分配律：$a \cdot (b + c) = (a \cdot b) + (a \cdot c)$

### 示例

- 有理数域 $(\mathbb{Q}, +, \cdot)$
- 实数域 $(\mathbb{R}, +, \cdot)$
- 复数域 $(\mathbb{C}, +, \cdot)$

## 3.2 有限域

### 定义

有限域（Galois 域）是元素个数有限的域。有限域的阶（元素个数）必须是素数的幂。

### 存在性定理

对于每个素数 $p$ 和正整数 $n$，存在唯一的（同构意义下）阶为 $p^n$ 的有限域，记作 $GF(p^n)$ 或 $\mathbb{F}_{p^n}$。

### 最简单的有限域

当 $n=1$ 时，我们得到素数域 $GF(p) = \mathbb{F}_p = \mathbb{Z}_p$。

## 3.3 素数域 $\mathbb{Z}_p$

### 定义

对于素数 $p$，$\mathbb{Z}_p = \{0, 1, 2, \ldots, p-1\}$ 构成一个域，其中：
- 加法：模 $p$ 加法
- 乘法：模 $p$ 乘法

### 验证域的性质

1. **加法阿贝尔群**：
   - 封闭性：$(a + b) \mod p \in \mathbb{Z}_p$
   - 结合律：$(a + b) + c \equiv a + (b + c) \pmod{p}$
   - 单位元：0
   - 逆元：$a$ 的加法逆元是 $p - a$

2. **乘法阿贝尔群**（排除 0）：
   - 封闭性：$(a \cdot b) \mod p \in \mathbb{Z}_p$
   - 结合律：$(a \cdot b) \cdot c \equiv a \cdot (b \cdot c) \pmod{p}$
   - 单位元：1
   - 逆元：存在性由费马小定理保证

3. **分配律**：$a \cdot (b + c) \equiv (a \cdot b) + (a \cdot c) \pmod{p}$

## 3.4 乘法逆元

### 费马小定理

如果 $p$ 是素数且 $a \not\equiv 0 \pmod{p}$，则：

$$a^{p-1} \equiv 1 \pmod{p}$$

### 乘法逆元计算

由费马小定理可得：

$$a \cdot a^{p-2} \equiv a^{p-1} \equiv 1 \pmod{p}$$

因此，$a$ 的乘法逆元为：

$$a^{-1} \equiv a^{p-2} \pmod{p}$$

### 代码实现

```c
#include <stdio.h>

// 快速幂模运算
long long mod_pow(long long base, long long exp, long long mod) {
    long long result = 1;
    base = base % mod;
    
    while (exp > 0) {
        if (exp % 2 == 1) {
            result = (result * base) % mod;
        }
        exp = exp >> 1;
        base = (base * base) % mod;
    }
    
    return result;
}

// 计算乘法逆元（使用费马小定理）
long long mod_inverse(long long a, long long p) {
    return mod_pow(a, p - 2, p);
}

// 验证乘法逆元
int verify_inverse(long long a, long long inv_a, long long p) {
    return (a * inv_a) % p == 1;
}

int main() {
    long long p = 7;  // 素数
    
    printf("模 %lld 乘法逆元表：\n", p);
    for (long long a = 1; a < p; a++) {
        long long inv_a = mod_inverse(a, p);
        printf("%lld^(-1) = %lld (验证: %lld * %lld mod %lld = %lld)\n", 
               a, inv_a, a, inv_a, p, (a * inv_a) % p);
    }
    
    return 0;
}
```

## 3.5 扩展欧几里得算法

### 算法原理

另一种计算乘法逆元的方法是扩展欧几里得算法。对于整数 $a$ 和 $p$，找到整数 $x$ 和 $y$，使得：

$$a \cdot x + p \cdot y = \gcd(a, p)$$

如果 $\gcd(a, p) = 1$，则 $x$ 就是 $a$ 模 $p$ 的乘法逆元。

### 代码实现

```c
#include <stdio.h>

// 扩展欧几里得算法
long long extended_gcd(long long a, long long b, long long *x, long long *y) {
    if (a == 0) {
        *x = 0;
        *y = 1;
        return b;
    }
    
    long long x1, y1;
    long long gcd = extended_gcd(b % a, a, &x1, &y1);
    
    *x = y1 - (b / a) * x1;
    *y = x1;
    
    return gcd;
}

// 使用扩展欧几里得算法计算乘法逆元
long long mod_inverse_extended(long long a, long long p) {
    long long x, y;
    long long gcd = extended_gcd(a, p, &x, &y);
    
    if (gcd != 1) {
        // 逆元不存在
        return -1;
    }
    
    // 确保结果为正
    return (x % p + p) % p;
}

int main() {
    long long p = 7;
    
    printf("使用扩展欧几里得算法计算模 %lld 乘法逆元：\n", p);
    for (long long a = 1; a < p; a++) {
        long long inv_a = mod_inverse_extended(a, p);
        printf("%lld^(-1) = %lld\n", a, inv_a);
    }
    
    return 0;
}
```

## 3.6 常数时间实现

### 为什么需要常数时间

在密码学中，运算时间不能依赖于秘密值，否则可能泄露信息。费马小定理方法更容易实现常数时间。

### 常数时间平方-乘法算法

```c
#include <stdio.h>

// 常数时间模幂运算
long long mod_pow_constant_time(long long base, long long exp, long long mod) {
    long long result = 1;
    base = base % mod;
    
    // 固定次数的迭代（假设 exp 是 255 位）
    for (int i = 253; i >= 0; i--) {
        // 平方
        result = (result * result) % mod;
        
        // 如果当前位为 1，则乘以 base
        long long bit = (exp >> i) & 1;
        long long mask = -bit;  // 0 或 0xFF...FF
        result = (result * ((base * bit) % mod)) % mod;
    }
    
    return result;
}

int main() {
    long long p = 255 - 19;  // 示例素数
    long long a = 12345;
    long long exp = p - 2;
    
    long long inv_a = mod_pow_constant_time(a, exp, p);
    printf("%lld^(-1) mod %lld = %lld\n", a, p, inv_a);
    printf("验证: %lld * %lld mod %lld = %lld\n", a, inv_a, p, (a * inv_a) % p);
    
    return 0;
}
```

## 3.7 Curve25519 中的有限域

### 参数

Curve25519 使用的有限域是 $\mathbb{Z}_p$，其中：

$$p = 2^{255} - 19$$

### 为什么选择这个素数

1. **接近 2 的幂**：便于高效实现
2. **素数**：确保有限域的性质
3. **255 位**：适合 32 字节表示
4. **特殊形式**：便于快速归约

### 十六进制表示

```
p = 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed
```

## 3.8 练习

1. 验证 $\mathbb{Z}_5$ 是一个域。
2. 计算 $\mathbb{Z}_7$ 中每个非零元素的乘法逆元。
3. 实现常数时间的乘法逆元计算。
4. 证明：如果 $p$ 不是素数，则 $\mathbb{Z}_p$ 不是域。

## 3.9 小结

有限域是椭圆曲线密码学的数学基础。通过理解有限域的性质和实现，我们为后续的椭圆曲线运算奠定了基础。

在下一章中，我们将学习椭圆曲线的基本概念，了解如何在有限域上定义椭圆曲线。