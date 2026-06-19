# X25519 椭圆曲线密码学从零实现教程

本教程基于 Martin Kleppmann 的论文《Implementing Curve25519/X25519: A Tutorial on Elliptic Curve Cryptography》，循序渐进地从零开始实现 X25519 Diffie-Hellman 密钥交换算法。

## 教程结构

### 第一部分：基础知识

1. **[模运算基础](01-modular-arithmetic.md)**
   - 整数模运算
   - 同余关系
   - 模运算性质

2. **[群论基础](02-group-theory.md)**
   - 群的定义和性质
   - 阿贝尔群
   - 循环群
   - 群的阶

3. **[有限域](03-finite-fields.md)**
   - 域的定义
   - 有限域算术
   - 乘法逆元

4. **[椭圆曲线简介](04-elliptic-curves.md)**
   - Montgomery 曲线
   - 曲线上的点
   - 群结构

### 第二部分：有限域算术实现

5. **[数据表示](05-data-representation.md)**
   - 字节数组表示
   - field_elem 表示
   - 转换函数

6. **[加法和减法](06-addition-subtraction.md)**
   - 模 p 加法
   - 模 p 减法
   - 进位处理

7. **[乘法](07-multiplication.md)**
   - 长乘法算法
   - 模 2p 归约
   - 进位传播

8. **[乘法逆元](08-multiplicative-inverse.md)**
   - 费马小定理
   - 平方-乘法算法
   - 常数时间实现

9. **[打包和解包](09-pack-unpack.md)**
   - 字节到域元素
   - 域元素到字节
   - 模 p 归约

### 第三部分：椭圆曲线算术

10. **[曲线方程](10-curve-equation.md)**
    - Montgomery 曲线形式
    - 参数选择
    - 曲线阶

11. **[点加法](11-point-addition.md)**
    - 几何意义
    - 代数公式
    - 特殊情况处理

12. **[标量乘法](12-scalar-multiplication.md)**
    - 重复加法
    - Montgomery 阶梯算法
    - 常数时间实现

### 第四部分：X25519 实现

13. **[密钥生成](13-key-generation.md)**
    - 随机数生成
    - 钳位处理
    - 公钥计算

14. **[密钥交换](14-key-exchange.md)**
    - Diffie-Hellman 协议
    - 共享密钥计算
    - 安全考虑

15. **[完整实现](15-complete-implementation.md)**
    - 完整代码
    - 测试向量
    - 性能优化

### 第五部分：附录

16. **[代码清单](16-code-listings.md)**
    - 所有代码汇总
    - 编译和运行
    - 测试用例

## 快速开始

```bash
# 编译教程代码
cd x25519-tutorial
gcc -o x25519 x25519.c -lm

# 运行测试
./x25519
```

## 参考文献

1. Martin Kleppmann. "Implementing Curve25519/X25519: A Tutorial on Elliptic Curve Cryptography."
2. Daniel J. Bernstein. "Curve25519: new Diffie-Hellman speed records."
3. Daniel J. Bernstein et al. "TweetNaCl: A Crypto Library in 100 Tweets."

## 许可证

本教程代码基于 TweetNaCl 实现，遵循公共领域许可。