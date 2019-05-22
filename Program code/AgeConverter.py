"""Conversor de edad para sondeo 977"""
import pandas as pd
import os
from pandas import DataFrame
from tkinter import filedialog
import tkinter as tk
import config
"""____window set_____"""
window=tk.Toplevel()
window.title('IchnopaleoCount alfa 1.0')
window.wm_iconbitmap("IconWindow.ico")
window.wm_title("Age Converter alfa 1")
window.attributes("-topmost", True)

L2=tk.Label(window,text="Select archive where depth data which will be age converted are located")
"""______Frame set___"""
Frame1=tk.Frame(window)
Frame2=tk.Frame(window)
Frame3=tk.Frame(window)
Frame4=tk.Frame(window)
Frame1.grid(row= 0, column=0, columnspan=2 )
Frame2.grid(row= 1, column=0 )
Frame3.grid(row= 1, column= 1)
Frame4.grid(row= 2, column= 0, columnspan=2)
"""___Frame 1___"""
L1=tk.Label(Frame1,text="Select archive where age model is located")
L1.grid(row= 0, column=0)
L2=tk.Label(Frame1,text="Select archive where depth data which will be age converted are located")
L2.grid(row= 1, column=0)
PathAgeM=""
PathDepthM=""
def GetfileAgeM():
    global PathAgeM
    if PathAgeM != "":
        DONE1.destroy()
    PathAgeM=filedialog.askopenfilename(initialdir = config.PathtoWfolder,title = "Select file (xlsx)")
    DONE1=tk.Label(Frame1,text=PathAgeM).grid(row=0,column=3)
def GetfileAgeM():
    global PathDepthM
    if PathDepthM != "":
        DONE2.destroy()
    PathDepthM=filedialog.askopenfilename(initialdir = config.PathtoWfolder,title = "Select file")
    DONE2=tk.Label(Frame1,text=PathDepthM).grid(row=0,column=3)
B1=tk.Button(Frame1,text="get file",command=lambda:GetfileAgeM())
B2=tk.Button(Frame1,text="get file",command=lambda:GetfileAgeM())
B1.grid(row= 0, column=1)
B2.grid(row= 1, column=1)

"""___VARs___"""
ColumnnDepthAgemodel=tk.StringVar()
SheetAgemodel=tk.StringVar()
ColumnAgeAgemodel=tk.StringVar()
SheetDepthM=tk.StringVar()
ColumnDepthDepthM=tk.StringVar()
"""___Frame 2___"""
L3=tk.Label(Frame2,text="Sheet name for Age and depth in AgeModel")
L3.grid(row= 0, column=0)
tk.Entry(Frame2,textvariable=SheetAgemodel).grid(row= 0, column=1)
L4=tk.Label(Frame2,text="Column where age is located in AgeModel")
L4.grid(row= 1, column=0)
tk.Entry(Frame2,textvariable=ColumnAgeAgemodel).grid(row= 1, column=1)
L5=tk.Label(Frame2,text="Column where depth is located in AgeModel")
L5.grid(row= 2, column=0)
tk.Entry(Frame2,textvariable=ColumnnDepthAgemodel).grid(row= 2, column=1)

"""___Frame 3___"""
L6=tk.Label(Frame3,text="Sheet Name for depth in data tu be converted")
L6.grid(row= 0, column=0)
tk.Entry(Frame3,textvariable=SheetDepthM).grid(row= 0, column=1)
L7=tk.Label(Frame2,text="Column where depth is located in depth to be convertedd")
L7.grid(row= 0, column=0)
tk.Entry(Frame3,textvariable=ColumnDepthDepthM).grid(row= 1, column=1)
"""___Frame 4___"""
def CombertAgeModel(AgemodelVars,DepthModelVars,Folders):
    AgeMp=pd.read_excel(Folders[0],sheet_name=AgemodelVars[0],usecols=AgemodelVars[1]+":"+AgemodelVars[2])
    DepthM=pd.read_excel(Folders[0],sheet_name=DepthModelVars[0],usecols=DepthModelVars[1])
    pprint(AgeM)
    pprint(DepthM)
def ConvertDepthtoAge():
    AgemodelVars=[SheetAgemodel.get(),ColumnAgeAgemodel.get(),ColumnnDepthAgemodel.get()]
    DepthModelVars=[SheetDepthM.get(),ColumnDepthDepthM.get()]
    Folders=[PathAgeM,PathDepthM]
    CombertAgeModel(AgemodelVars,DepthModelVars,Folders)
B3=tk.Button(Frame4,text="go",command=ConvertDepthtoAge())




aux2=pd.read_excel()
aux2=pd.read_excel()




"Sheet Name for depth in data tu be converted"
"column where age is located in AgeModel"
"Column where depth is located in Age Model"
"Column where depth is located in depth to be converted"
