import math

def __a_bunch_of_additions(**kwargs):
    return sum(kwargs.values())

def __a_bunch_of_multiplications(**kwargs):
    return math.prod(kwargs.values())

def __a_bunch_of_subtractions(**kwargs):
    values = list(kwargs.values())
    return values[0] - sum(values[1:])

def __a_bunch_of_divisions(**kwargs):
    values = list(kwargs.values())
    if 0 in values[1:]:
        return "Error: Division by zero"
    return values[0] / math.prod(values[1:])

class MultiCalculator:
    def __init__(self, values: list[int]):
        self.values = values

    def a_bunch_of_additions(self):
        return __a_bunch_of_additions(**self.values)
    def a_bunch_of_multiplications(self):
        return __a_bunch_of_multiplications(**self.values)
    def a_bunch_of_subtractions(self):
        return __a_bunch_of_subtractions(**self.values)
    def a_bunch_of_divisions(self):
        return __a_bunch_of_divisions(**self.values)

multi_calculator = MultiCalculator([1, 2, 3])
assert multi_calculator.a_bunch_of_additions() == 6
assert multi_calculator.a_bunch_of_multiplications() == 6
assert multi_calculator.a_bunch_of_subtractions() == -4
assert multi_calculator.a_bunch_of_divisions() == 0.16666666666666666