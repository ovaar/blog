+++
date = "2023-03-02"
title = "Create an array of all possible variants alternatives of std::variant type"
type = "post"
categories = ["Development"]
tags = ["Development", "C++"]
+++

The standard library [std::variant](https://en.cppreference.com/w/cpp/utility/variant) is a usefull feature, introduced since c++17, to define a type that can hold multiple alternative types. 

For example a cell of a CSV file could represent multiple data types such as a string or int. Declaring a new type `std::variant<std::string, int>` allows to store one of the alternative types at the time. The std::variant internally allocates space for the largest alternative type. 

> But what if you need to extract what the possible alternatives of the std::variant ?


There are some helper method than can give away some information about the internals of the declared std::variant type.

* variant_size, variant_size_v: obtains the size of the variant's list of alternatives at compile time
* variant_alternative variant_alternative_t: obtains the type of the alternative specified by its index, at compile time


```cpp
#include <variant>
#include <array>
#include <string>
#include <iostream>
#include <type_traits>

template <typename Template, std::size_t I>
constexpr auto make_variant_alternative()
{
    using Type = std::variant_alternative_t<I, Template>;
    return Type{};
}

namespace detail
{
    template <std::size_t I, typename VariantType, std::size_t N>
    struct VariantAlternativesLoop
    {
        static void impl(std::array<VariantType, N>& arr)
        {
            // Instantiate a new instance of one of the concrete std::variant types by index.
            arr[I - 1] = make_variant_alternative<VariantType, I - 1>();

            // Continue the loop
            VariantAlternativesLoop<I - 1, VariantType, N>::impl(arr);
        }
    };

    // Provide default implementation
    template <typename VariantType, std::size_t N>
    struct VariantAlternativesLoop<0, VariantType, N>
    {
        static void impl(std::array<VariantType, N>&)
        {
            // Do nothing (terminate loop)
        }
    };
} // namespace detail

template <typename VariantType>
auto make_variant_alternatives_array()
{
    constexpr std::size_t      N = std::variant_size_v<VariantType>;
    std::array<VariantType, N> variantsArray;

    detail::VariantAlternativesLoop<N, VariantType, N>::impl(variantsArray);

    return variantsArray;
}

using property_t = std::variant<int, std::string>;

int main ()
{ 
    const auto properties = make_variant_alternatives_array<property_t>();
    for (std::size_t i = 0; i < properties.size(); ++i)
    {
        std::visit([](auto&& args)
        {
            using T = std::decay_t<decltype(args)>;
            if constexpr (std::is_same_v<T, int>)
                std::cout << "integer" << std::endl;
            if constexpr (std::is_same_v<T, std::string>)
                std::cout << "string" << std::endl;
        }, properties[i]);
    } 
}
// Program stdout
// $ integer
// $ string
```
